import type { ApprovalRequest } from '@root/types/approval.types.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

interface ApprovalCommandContext {
  fastify: FastifyInstance
  log: FastifyBaseLogger
}

export const approvalCommand = {
  data: new SlashCommandBuilder()
    .setName('approvals')
    .setDescription('Review pending approval requests (Primary admin only)'),

  async execute(
    interaction: ChatInputCommandInteraction,
    context: ApprovalCommandContext,
  ): Promise<void> {
    const { fastify, log } = context

    try {
      // Check if user is primary admin
      const isPrimary = await checkUserIsPrimary(interaction.user.id, fastify)
      if (!isPrimary) {
        await interaction.reply({
          content: '❌ You are not authorized to use this command.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      log.debug(
        { userId: interaction.user.id },
        'Primary admin accessed approval command',
      )

      // Show the main approval management menu
      await showApprovalMainMenu(interaction, fastify, log)
    } catch (error) {
      log.error({ error }, 'Error in approval command')

      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred'

      if (interaction.replied) {
        await interaction.followUp({
          content: `❌ Error: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        })
      } else {
        await interaction.reply({
          content: `❌ Error: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}

/**
 * Show main approval management menu
 */
async function showApprovalMainMenu(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    // Get counts for display
    const [pendingApprovals, allApprovals] = await Promise.all([
      fastify.db.getPendingApprovalRequests(),
      fastify.db.getApprovalHistory(), // Get all for total count
    ])

    const pendingCount = pendingApprovals.length
    const totalCount = allApprovals.length

    const menuEmbed = new EmbedBuilder()
      .setTitle('📋 Approval Management')
      .setDescription('Choose an option to manage approval requests')
      .setColor(0x5865f2)
      .addFields([
        {
          name: '📊 Status Overview',
          value: `**${pendingCount}** pending requests\n**${totalCount}** total requests`,
          inline: false,
        },
      ])
      .setTimestamp()

    const menuActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('approval_menu_pending')
        .setLabel(`📥 Review Pending (${pendingCount})`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pendingCount === 0),
      new ButtonBuilder()
        .setCustomId('approval_menu_history')
        .setLabel('📊 View History')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(totalCount === 0),
      new ButtonBuilder()
        .setCustomId('approval_menu_exit')
        .setLabel('❌ Close')
        .setStyle(ButtonStyle.Secondary),
    )

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [menuEmbed],
        components: [menuActionRow],
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.editReply({
        content: '',
        embeds: [menuEmbed],
        components: [menuActionRow],
      })
    }

    log.debug(
      {
        userId: interaction.user.id,
        pendingCount,
        totalCount,
      },
      'Showed approval management menu',
    )
  } catch (error) {
    log.error({ error }, 'Error showing approval main menu')
    throw error
  }
}

/**
 * Show approval at specific index with navigation
 */
export async function showApprovalAtIndex(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  currentIndex: number,
  allApprovals: ApprovalRequest[],
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  ephemeral = false,
): Promise<void> {
  const approval = allApprovals[currentIndex]
  if (!approval) {
    await interaction.reply({
      content: '❌ Approval not found',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const { embed, actionRows } = await createApprovalMessageWithNavigation(
    approval,
    currentIndex,
    allApprovals.length,
    fastify,
  )

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [embed],
        components: actionRows,
        ...(ephemeral && { flags: MessageFlags.Ephemeral }),
      })
    } else {
      await interaction.editReply({
        content: '',
        embeds: [embed],
        components: actionRows,
      })
    }

    log.debug(
      {
        userId: interaction.user.id,
        approvalId: approval.id,
        currentIndex,
        totalApprovals: allApprovals.length,
      },
      'Showed approval with navigation',
    )
  } catch (error) {
    log.error(
      { error, approvalId: approval.id, currentIndex },
      'Error showing approval message',
    )
    throw error
  }
}

/**
 * Get user by Discord ID (reuses existing pattern from notifications command)
 */
async function getUserByDiscordId(
  discordId: string,
  fastify: FastifyInstance,
): Promise<import('@root/types/config.types.js').User | null> {
  try {
    const users = await fastify.db.getAllUsers()
    const user = users.find((u) => u.discord_id === discordId)
    return user || null
  } catch (error) {
    fastify.log.error({ error, discordId }, 'Error getting user by Discord ID')
    return null
  }
}

/**
 * Check if Discord user is the primary admin
 */
async function checkUserIsPrimary(
  discordUserId: string,
  fastify: FastifyInstance,
): Promise<boolean> {
  try {
    const user = await getUserByDiscordId(discordUserId, fastify)
    return user?.is_primary_token === true
  } catch (error) {
    fastify.log.error(
      { error, discordUserId },
      'Error checking primary user status',
    )
    return false
  }
}

/**
 * Get admin user record from Discord ID
 */
async function getAdminUserFromDiscord(
  discordUserId: string,
  fastify: FastifyInstance,
): Promise<{ id: number; name: string } | null> {
  try {
    const user = await getUserByDiscordId(discordUserId, fastify)

    if (!user || !user.is_primary_token) {
      return null
    }

    return {
      id: user.id,
      name: user.name,
    }
  } catch (error) {
    fastify.log.error(
      { error, discordUserId },
      'Error getting admin user from Discord',
    )
    return null
  }
}

/**
 * Create approval message embed with navigation buttons
 */
async function createApprovalMessageWithNavigation(
  approval: ApprovalRequest,
  currentIndex: number,
  totalCount: number,
  fastify: FastifyInstance,
): Promise<{
  embed: EmbedBuilder
  actionRows: ActionRowBuilder<ButtonBuilder>[]
}> {
  const embed = new EmbedBuilder()
    .setTitle(`${approval.contentTitle}`)
    .setColor(0xff9500)
    .addFields([
      {
        name: 'Request Information',
        value: [
          `**User:** ${approval.userName || `User ${approval.userId}`}`,
          `**Created:** ${new Date(approval.createdAt).toLocaleDateString(
            'en-US',
            {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            },
          )}`,
          `**Content Type:** ${approval.contentType}`,
          `**Triggered By:** ${formatTriggerReason(approval.triggeredBy, approval.approvalReason || null)}`,
          approval.expiresAt
            ? `**Expires:** ${new Date(approval.expiresAt).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      },
    ])

  // Add Content GUIDs if available
  if (approval.contentGuids && approval.contentGuids.length > 0) {
    embed.addFields([
      {
        name: 'Content GUIDs',
        value: approval.contentGuids.join(', '),
        inline: false,
      },
    ])
  }

  embed.setFooter({
    text: `Approval ${currentIndex + 1} of ${totalCount} • Status: ${approval.status.toUpperCase()} • ID: ${approval.id}`,
  })

  // Get poster from watchlist item
  try {
    const watchlistItems = await fastify.db.getWatchlistItemsByKeys([
      approval.contentKey,
    ])
    if (watchlistItems.length > 0 && watchlistItems[0].thumb) {
      embed.setImage(watchlistItems[0].thumb)
    }
  } catch (_error) {
    // Silently ignore poster lookup errors
  }

  // Top row: Action buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approval_approve_${approval.id}_${currentIndex}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`approval_reject_${approval.id}_${currentIndex}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`approval_details_${approval.id}_${currentIndex}`)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary),
  )

  // Bottom row: Navigation buttons (conditional)
  const navigationRow = new ActionRowBuilder<ButtonBuilder>()

  // Add back button if not first
  if (currentIndex > 0) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_nav_back_${currentIndex}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    )
  }

  // Add next button if not last
  if (currentIndex < totalCount - 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_nav_next_${currentIndex}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Secondary),
    )
  }

  // Always add back to menu button for pending approvals
  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId('approval_menu_main')
      .setLabel('← Menu')
      .setStyle(ButtonStyle.Secondary),
  )

  const actionRows = [actionRow]
  if (navigationRow.components.length > 0) {
    actionRows.push(navigationRow)
  }

  return { embed, actionRows }
}

/**
 * Format trigger reason for display
 */
function formatTriggerReason(trigger: string, reason: string | null): string {
  const triggerMap: Record<string, string> = {
    manual_flag: '🚩 Manual Flag',
    quota_exceeded: '📊 Quota Exceeded',
    user_request: '👤 User Request',
    system_flag: '🤖 System Flag',
  }

  const triggerText = triggerMap[trigger] || `🔍 ${trigger}`
  return reason ? `${triggerText}\n${reason}` : triggerText
}

/**
 * Handle approval button interactions
 */
export async function handleApprovalButtons(
  interaction: ButtonInteraction,
  context: ApprovalCommandContext,
): Promise<void> {
  const { fastify, log } = context

  if (!interaction.customId.startsWith('approval_')) {
    return
  }

  const parts = interaction.customId.split('_')

  // Handle main menu buttons
  if (parts[1] === 'menu') {
    const menuAction = parts[2]
    await handleMenuAction(interaction, menuAction, fastify, log)
    return
  }

  // Handle navigation buttons
  if (parts[1] === 'nav') {
    const direction = parts[2] // 'back' or 'next'
    const currentIndex = Number.parseInt(parts[3], 10)

    if (Number.isNaN(currentIndex)) {
      await interaction.reply({
        content: '❌ Invalid navigation index',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await handleNavigationAction(
      interaction,
      direction,
      currentIndex,
      fastify,
      log,
    )
    return
  }

  // Handle history navigation buttons
  if (parts[1] === 'history') {
    await handleHistoryAction(interaction, parts, fastify, log)
    return
  }

  // Handle individual item clicks
  if (parts[1] === 'item') {
    await handleItemAction(interaction, parts, fastify, log)
    return
  }

  // Handle delete confirmation
  if (parts[1] === 'delete') {
    await handleDeleteAction(interaction, parts, fastify, log)
    return
  }

  // Handle approval action buttons
  const action = parts[1]
  const approvalIdStr = parts[2]
  const currentIndexStr = parts[3]

  const approvalId = Number.parseInt(approvalIdStr, 10)
  const currentIndex = Number.parseInt(currentIndexStr, 10)

  if (Number.isNaN(approvalId) || Number.isNaN(currentIndex)) {
    await interaction.reply({
      content: '❌ Invalid approval ID or index',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    switch (action) {
      case 'approve':
        await handleApprovalAction(
          interaction,
          approvalId,
          currentIndex,
          'approve',
          fastify,
          log,
        )
        break
      case 'reject':
        await handleApprovalAction(
          interaction,
          approvalId,
          currentIndex,
          'reject',
          fastify,
          log,
        )
        break
      case 'details':
        await handleApprovalDetails(
          interaction,
          approvalId,
          currentIndex,
          fastify,
          log,
        )
        break
      case 'back':
        await handleApprovalBack(
          interaction,
          approvalId,
          currentIndex,
          fastify,
          log,
        )
        break
      default:
        await interaction.reply({
          content: '❌ Unknown action',
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    log.error(
      { error, approvalId, currentIndex, action },
      'Error handling approval button',
    )

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred'

    if (interaction.replied) {
      await interaction.followUp({
        content: `❌ Error: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.reply({
        content: `❌ Error: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

/**
 * Show loading state with disabled buttons
 */
async function showLoadingState(
  interaction: ButtonInteraction,
  action: 'approve' | 'reject',
  currentIndex: number,
  fastify: FastifyInstance,
): Promise<void> {
  try {
    // Get the current approval info
    const parts = interaction.customId.split('_')
    const approvalId = Number.parseInt(parts[2], 10)
    const approval = await fastify.db.getApprovalRequest(approvalId)

    if (!approval) {
      await interaction.reply({
        content: '❌ Approval not found',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Create disabled buttons with loading indicator
    const { embed } = await createApprovalMessageWithNavigation(
      approval,
      currentIndex,
      1, // Fake total count for loading state
      fastify,
    )

    // Create loading action row with disabled buttons
    const loadingActionRow = new ActionRowBuilder<ButtonBuilder>()

    // Approve button - loading if approve action, disabled otherwise
    const approveButton = new ButtonBuilder()
      .setCustomId(`loading_approve_${approvalId}`)
      .setLabel(action === 'approve' ? 'Approving...' : 'Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)

    // Reject button - loading if reject action, disabled otherwise
    const rejectButton = new ButtonBuilder()
      .setCustomId(`loading_reject_${approvalId}`)
      .setLabel(action === 'reject' ? 'Rejecting...' : 'Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)

    // Details button - always disabled during loading
    const detailsButton = new ButtonBuilder()
      .setCustomId(`loading_details_${approvalId}`)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)

    loadingActionRow.addComponents(approveButton, rejectButton, detailsButton)

    await interaction.update({
      embeds: [embed],
      components: [loadingActionRow],
    })
  } catch (_error) {
    // Fallback to defer if update fails
    await interaction.deferUpdate()
  }
}

/**
 * Show success state with feedback
 */
async function showSuccessState(
  interaction: ButtonInteraction,
  action: 'approve' | 'reject',
  approval: ApprovalRequest,
): Promise<void> {
  const actionText = action === 'approve' ? 'Approved' : 'Rejected'
  const emoji = action === 'approve' ? '✅' : '❌'

  const successEmbed = new EmbedBuilder()
    .setTitle(`${emoji} ${actionText}`)
    .setDescription(`**${approval.contentTitle}** has been ${action}d`)
    .setColor(action === 'approve' ? 0x57f287 : 0xed4245)
    .setTimestamp()

  await interaction.editReply({
    content: '',
    embeds: [successEmbed],
    components: [],
  })
}

/**
 * Handle main menu actions
 */
async function handleMenuAction(
  interaction: ButtonInteraction,
  menuAction: string,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    switch (menuAction) {
      case 'pending': {
        // Show pending approvals review flow
        const pendingApprovals = await fastify.db.getPendingApprovalRequests()
        if (pendingApprovals.length === 0) {
          await interaction.editReply({
            content: '✅ No pending approval requests found!',
            embeds: [],
            components: [],
          })
          return
        }
        await showApprovalAtIndex(
          interaction,
          0,
          pendingApprovals,
          fastify,
          log,
        )
        break
      }

      case 'history':
        // Show approval history browser
        await showApprovalHistory(interaction, 0, 'all', fastify, log)
        break

      case 'main':
        // Go back to main menu
        await showApprovalMainMenu(interaction, fastify, log)
        break

      case 'exit':
        // Close the interaction
        await interaction.editReply({
          content: '✅ Approval management closed.',
          embeds: [],
          components: [],
        })
        break

      default:
        await interaction.editReply('❌ Unknown menu action')
    }
  } catch (error) {
    log.error({ error, menuAction }, 'Error handling menu action')
    await interaction.editReply('❌ Error processing menu action')
  }
}

/**
 * Display a paginated, filterable view of approval history and attach interactive buttons.
 *
 * Shows up to five approval items per page, renders a summary embed, adds item selection buttons,
 * filter buttons (All, Pending, Approved, Rejected, Expired, Auto-Approved), and pagination controls. Edits the original
 * interaction reply with the constructed embed and components; if there are no results on the
 * first page, returns a small "no history" message and a back-to-menu button.
 *
 * @param page - Zero-based page index to display.
 * @param filter - Filter key: "all" for no filter, or one of
 *                 "pending" | "approved" | "rejected" | "expired" | "auto_approved".
 */
async function showApprovalHistory(
  interaction: ButtonInteraction,
  page: number,
  filter: string,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const pageSize = 5 // Reduced to fit button limits
    const offset = page * pageSize

    // Map filter to database status
    let status: ApprovalRequest['status'] | undefined
    switch (filter) {
      case 'pending':
        status = 'pending'
        break
      case 'approved':
        status = 'approved'
        break
      case 'rejected':
        status = 'rejected'
        break
      case 'expired':
        status = 'expired'
        break
      case 'auto_approved':
        status = 'auto_approved'
        break
      default:
        status = undefined // 'all'
    }

    // Get paginated history
    const approvals = await fastify.db.getApprovalHistory(
      undefined, // userId - get all users
      status,
      pageSize,
      offset,
    )

    if (approvals.length === 0 && page === 0) {
      await interaction.editReply({
        content: '📋 No approval history found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    // Create history embed
    const historyEmbed = new EmbedBuilder()
      .setTitle(`📊 Approval History (Page ${page + 1})`)
      .setDescription(
        `Filter: **${filter.charAt(0).toUpperCase() + filter.slice(1)}**`,
      )
      .setColor(0x5865f2)

    // Add approval items as clickable buttons (max 5 per page to fit Discord limits)
    const displayApprovals = approvals.slice(0, 5)

    for (const approval of displayApprovals) {
      const statusEmoji =
        {
          pending: '⏳',
          approved: '✅',
          rejected: '❌',
          expired: '⏰',
          auto_approved: '🤖',
        }[approval.status] || '❓'

      const contentType =
        approval.contentType.charAt(0).toUpperCase() +
        approval.contentType.slice(1)

      historyEmbed.addFields({
        name: `${statusEmoji} ${approval.contentTitle}`,
        value: `${contentType} • ${approval.userName || `User ${approval.userId}`} • ID: ${approval.id}`,
        inline: false,
      })
    }

    // Create clickable item buttons
    const itemButtons = []
    for (let i = 0; i < displayApprovals.length; i++) {
      const approval = displayApprovals[i]
      itemButtons.push(
        new ButtonBuilder()
          .setCustomId(`approval_item_${approval.id}_${page}_${filter}`)
          .setLabel(
            `${i + 1}. ${approval.contentTitle.substring(0, 20)}${approval.contentTitle.length > 20 ? '...' : ''}`,
          )
          .setStyle(ButtonStyle.Secondary),
      )
    }

    // Create navigation buttons
    const actionRows = []

    // Item selection buttons (if any items)
    if (itemButtons.length > 0) {
      const itemRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...itemButtons,
      )
      actionRows.push(itemRow)
    }

    // Filter buttons row 1 (All, Pending, Approved)
    const filterRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('approval_history_filter_all')
        .setLabel('All')
        .setStyle(
          filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_pending')
        .setLabel('Pending')
        .setStyle(
          filter === 'pending' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_approved')
        .setLabel('Approved')
        .setStyle(
          filter === 'approved' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    )
    actionRows.push(filterRow1)

    // Filter buttons row 2 (Rejected, Expired, Auto-Approved)
    const filterRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('approval_history_filter_rejected')
        .setLabel('Rejected')
        .setStyle(
          filter === 'rejected' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_expired')
        .setLabel('Expired')
        .setStyle(
          filter === 'expired' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_auto_approved')
        .setLabel('Auto-Approved')
        .setStyle(
          filter === 'auto_approved'
            ? ButtonStyle.Primary
            : ButtonStyle.Secondary,
        ),
    )
    actionRows.push(filterRow2)

    // Navigation buttons row
    const navRow = new ActionRowBuilder<ButtonBuilder>()

    if (page > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`approval_history_page_${page - 1}_${filter}`)
          .setLabel('← Previous')
          .setStyle(ButtonStyle.Secondary),
      )
    }

    if (approvals.length === pageSize) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`approval_history_page_${page + 1}_${filter}`)
          .setLabel('Next →')
          .setStyle(ButtonStyle.Secondary),
      )
    }

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )

    if (navRow.components.length > 0) {
      actionRows.push(navRow)
    }

    await interaction.editReply({
      content: '',
      embeds: [historyEmbed],
      components: actionRows,
    })
  } catch (error) {
    log.error({ error, page, filter }, 'Error showing approval history')
    await interaction.editReply('❌ Error loading approval history')
  }
}

/**
 * Handle individual item clicks
 */
async function handleItemAction(
  interaction: ButtonInteraction,
  parts: string[],
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    const approvalId = Number.parseInt(parts[2], 10)
    const returnPage = Number.parseInt(parts[3], 10)
    const returnFilter = parts.slice(4).join('_') || 'all'

    if (Number.isNaN(approvalId)) {
      await interaction.editReply('❌ Invalid approval ID')
      return
    }

    await showItemDetail(
      interaction,
      approvalId,
      returnPage,
      returnFilter,
      fastify,
      log,
    )
  } catch (error) {
    log.error({ error, parts }, 'Error handling item action')
    await interaction.editReply('❌ Error processing item action')
  }
}

/**
 * Display a detailed view for a single approval request and present context-appropriate action and navigation buttons.
 *
 * Loads the approval by ID, constructs an embed showing request metadata, trigger reason, timestamps, and any approval action history, then updates the interaction reply with action buttons tailored to the approval's current status (e.g., Approve/Reject/Delete) and navigation buttons back to history or the main menu. If the approval is not found, the reply is updated with a not-found message. Errors are logged and reported to the user via an edited reply.
 *
 * @param returnPage - The history page number to return to when the user selects "Back to History"
 * @param returnFilter - The history filter identifier to preserve when returning to the history view
 */
async function showItemDetail(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const approval = await fastify.db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    const statusEmoji =
      {
        pending: '⏳',
        approved: '✅',
        rejected: '❌',
        expired: '⏰',
        auto_approved: '🤖',
      }[approval.status] || '❓'

    const statusColor =
      {
        pending: 0xfee75c,
        approved: 0x57f287,
        rejected: 0xed4245,
        expired: 0x6c757d,
        auto_approved: 0x00d4aa,
      }[approval.status] || 0x5865f2

    const detailEmbed = new EmbedBuilder()
      .setTitle(`${statusEmoji} ${approval.contentTitle}`)
      .setDescription(
        `**${approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}** approval request`,
      )
      .setColor(statusColor)
      .addFields([
        {
          name: '📋 Request Details',
          value: [
            `**Content:** ${approval.contentTitle}`,
            `**Type:** ${approval.contentType.charAt(0).toUpperCase() + approval.contentType.slice(1)}`,
            `**Requested by:** ${approval.userName || `User ${approval.userId}`}`,
            `**Created:** ${new Date(approval.createdAt).toLocaleDateString(
              'en-US',
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              },
            )}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔍 Trigger Reason',
          value: formatTriggerReason(
            approval.triggeredBy,
            approval.approvalReason || null,
          ),
          inline: false,
        },
      ])
      .setFooter({ text: `ID: ${approval.id}` })
      .setTimestamp()

    // Add approval details if exists
    if (approval.approvedBy || approval.approvalNotes) {
      const approvalDetails = []
      if (approval.approvedBy) {
        approvalDetails.push(`**Action by:** User ${approval.approvedBy}`)
      }
      if (approval.approvalNotes) {
        approvalDetails.push(`**Notes:** ${approval.approvalNotes}`)
      }

      detailEmbed.addFields({
        name: '📝 Action History',
        value: approvalDetails.join('\n'),
        inline: false,
      })
    }

    // Create action buttons based on current status
    const actionRows = []
    const actionRow = new ActionRowBuilder<ButtonBuilder>()

    // State transition rules:
    // - Pending: Approve/Reject/Delete
    // - Approved: Delete only (cannot reject once approved)
    // - Rejected: Approve/Delete (allows reversal)
    // - Expired: Delete only

    switch (approval.status) {
      case 'pending':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`approval_approve_${approvalId}_0`) // Use 0 for index since we're not in review flow
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`approval_reject_${approvalId}_0`)
            .setLabel('❌ Reject')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Secondary),
        )
        break

      case 'rejected':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`approval_approve_${approvalId}_0`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Secondary),
        )
        break

      case 'approved':
      case 'auto_approved':
      case 'expired':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Danger),
        )
        break
    }

    if (actionRow.components.length > 0) {
      actionRows.push(actionRow)
    }

    // Navigation row
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_history_page_${returnPage}_${returnFilter}`)
        .setLabel('← Back to History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )
    actionRows.push(navRow)

    await interaction.editReply({
      content: '',
      embeds: [detailEmbed],
      components: actionRows,
    })

    log.debug(
      {
        userId: interaction.user.id,
        approvalId,
        status: approval.status,
      },
      'Showed individual approval item detail',
    )
  } catch (error) {
    log.error({ error, approvalId }, 'Error showing item detail')
    await interaction.editReply('❌ Error loading item details')
  }
}

/**
 * Handle delete confirmation and execution
 */
async function handleDeleteAction(
  interaction: ButtonInteraction,
  parts: string[],
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    const action = parts[2] // 'confirm' or 'execute'
    const approvalId = Number.parseInt(parts[3], 10)

    if (Number.isNaN(approvalId)) {
      await interaction.editReply('❌ Invalid approval ID')
      return
    }

    if (action === 'confirm') {
      // Show delete confirmation
      const returnPage = Number.parseInt(parts[4], 10) || 0
      const returnFilter = parts.slice(5).join('_') || 'all'
      await showDeleteConfirmation(
        interaction,
        approvalId,
        returnPage,
        returnFilter,
        fastify,
        log,
      )
    } else if (action === 'execute') {
      // Execute the delete
      const returnPage = Number.parseInt(parts[4], 10) || 0
      const returnFilter = parts.slice(5).join('_') || 'all'
      await executeDelete(
        interaction,
        approvalId,
        returnPage,
        returnFilter,
        fastify,
        log,
      )
    }
  } catch (error) {
    log.error({ error, parts }, 'Error handling delete action')
    await interaction.editReply('❌ Error processing delete action')
  }
}

/**
 * Show delete confirmation dialog
 */
async function showDeleteConfirmation(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const approval = await fastify.db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('🗑️ Delete Approval Request?')
      .setDescription('This will permanently delete this approval request.')
      .setColor(0xed4245)
      .addFields([
        {
          name: '⚠️ Request to Delete',
          value: [
            `**Content:** ${approval.contentTitle}`,
            `**Type:** ${approval.contentType.charAt(0).toUpperCase() + approval.contentType.slice(1)}`,
            `**Status:** ${approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}`,
            `**Requested by:** ${approval.userName || `User ${approval.userId}`}`,
          ].join('\n'),
          inline: false,
        },
      ])
      .setFooter({ text: 'This action cannot be undone!' })

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `approval_delete_execute_${approvalId}_${returnPage}_${returnFilter}`,
        )
        .setLabel('🗑️ DELETE')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(
          `approval_item_${approvalId}_${returnPage}_${returnFilter}`,
        )
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      content: '',
      embeds: [confirmEmbed],
      components: [confirmRow],
    })

    log.debug(
      {
        userId: interaction.user.id,
        approvalId,
      },
      'Showed delete confirmation for approval request',
    )
  } catch (error) {
    log.error({ error, approvalId }, 'Error showing delete confirmation')
    await interaction.editReply('❌ Error loading delete confirmation')
  }
}

/**
 * Execute the delete operation
 */
async function executeDelete(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    // Get approval details before deletion for logging
    const approval = await fastify.db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    // Delete the approval request
    const deleted =
      await fastify.approvalService.deleteApprovalRequest(approvalId)

    if (!deleted) {
      await interaction.editReply({
        content: '❌ Failed to delete approval request',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    // Show success message
    const successEmbed = new EmbedBuilder()
      .setTitle('🗑️ Deleted')
      .setDescription(
        `**${approval.contentTitle}** has been permanently deleted`,
      )
      .setColor(0x57f287)
      .setTimestamp()

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_history_page_${returnPage}_${returnFilter}`)
        .setLabel('← Back to History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: [backRow],
    })

    log.info(
      {
        userId: interaction.user.id,
        approvalId,
        contentTitle: approval.contentTitle,
        status: approval.status,
      },
      'Successfully deleted approval request',
    )
  } catch (error) {
    log.error({ error, approvalId }, 'Error executing delete')
    await interaction.editReply('❌ Error deleting approval request')
  }
}

/**
 * Handle history-related actions
 */
async function handleHistoryAction(
  interaction: ButtonInteraction,
  parts: string[],
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    const action = parts[2] // filter, page, etc.

    if (action === 'filter') {
      const filter = parts.slice(3).join('_') || 'all'
      await showApprovalHistory(interaction, 0, filter, fastify, log)
    } else if (action === 'page') {
      const page = Number.parseInt(parts[3], 10)
      const filter = parts.slice(4).join('_') || 'all'
      await showApprovalHistory(interaction, page, filter, fastify, log)
    }
  } catch (error) {
    log.error({ error, parts }, 'Error handling history action')
    await interaction.editReply('❌ Error processing history action')
  }
}

/**
 * Create a back to menu button
 */
function createBackToMenuButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('approval_menu_main')
      .setLabel('← Back to Menu')
      .setStyle(ButtonStyle.Secondary),
  )
}

/**
 * Handle navigation actions
 */
async function handleNavigationAction(
  interaction: ButtonInteraction,
  direction: string,
  currentIndex: number,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    // Get all pending approvals
    const pendingApprovals = await fastify.db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.editReply({
        content: '✅ No pending approval requests found!',
        embeds: [],
        components: [],
      })
      return
    }

    let newIndex = currentIndex
    if (direction === 'back' && currentIndex > 0) {
      newIndex = currentIndex - 1
    } else if (
      direction === 'next' &&
      currentIndex < pendingApprovals.length - 1
    ) {
      newIndex = currentIndex + 1
    }

    await showApprovalAtIndex(
      interaction,
      newIndex,
      pendingApprovals,
      fastify,
      log,
    )
  } catch (error) {
    log.error({ error, direction, currentIndex }, 'Error handling navigation')
    await interaction.editReply('❌ Error navigating approvals')
  }
}

/**
 * Handle approve/reject actions
 */
async function handleApprovalAction(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  action: 'approve' | 'reject',
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  // Show loading state immediately
  await showLoadingState(interaction, action, currentIndex, fastify)

  try {
    // Get approval request
    const approval = await fastify.db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply('❌ Approval request not found')
      return
    }

    const isReversalAllowed =
      approval.status === 'rejected' && action === 'approve'
    if (approval.status !== 'pending' && !isReversalAllowed) {
      const message =
        approval.status === 'auto_approved'
          ? '❌ This approval request was auto-approved and cannot be modified'
          : `❌ This approval request is already ${approval.status}`
      await interaction.editReply(message)
      return
    }

    // Get the admin user ID from Discord user
    const adminUser = await getAdminUserFromDiscord(
      interaction.user.id,
      fastify,
    )
    if (!adminUser) {
      await interaction.editReply('❌ Could not identify admin user')
      return
    }

    // Process the approval/rejection using the EXACT same logic as API routes
    if (action === 'approve') {
      // Step 1: Approve the request (same as API route)
      const approvedRequest = await fastify.approvalService.approveRequest(
        approvalId,
        adminUser.id,
        'Approved via Discord',
      )

      if (!approvedRequest) {
        await interaction.editReply('❌ Failed to approve request')
        return
      }

      // Step 2: Process the approved request (same as API route)
      const result =
        await fastify.approvalService.processApprovedRequest(approvedRequest)

      if (!result.success) {
        await interaction.editReply(
          `❌ Approved but failed to process: ${result.error}`,
        )
        return
      }

      // Show success feedback
      await showSuccessState(interaction, 'approve', approval)
    } else {
      // Reject the request using the approval service (same as API route)
      const rejectedRequest = await fastify.approvalService.rejectRequest(
        approvalId,
        adminUser.id,
        'Rejected via Discord',
      )

      if (!rejectedRequest) {
        await interaction.editReply('❌ Failed to reject request')
        return
      }

      // Show success feedback
      await showSuccessState(interaction, 'reject', approval)
    }

    // Show next approval after a short delay
    setTimeout(async () => {
      await showNextApprovalAfterAction(interaction, currentIndex, fastify, log)
    }, 1500)
  } catch (error) {
    log.error({ error, approvalId, action }, 'Error processing approval action')
    await interaction.editReply(
      `❌ Error processing ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Show approval details
 */
async function handleApprovalDetails(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    const approval = await fastify.db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [],
      })
      return
    }

    // Show comprehensive details like the web interface
    const detailsEmbed = new EmbedBuilder()
      .setTitle(`${approval.contentTitle} - Detailed View`)
      .setColor(0x5865f2)
      .addFields([
        {
          name: 'Request Information',
          value: [
            `**User:** ${approval.userName || `User ${approval.userId}`}`,
            `**Created:** ${new Date(approval.createdAt).toLocaleDateString(
              'en-US',
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              },
            )}`,
            `**Content Type:** ${approval.contentType}`,
            `**Triggered By:** ${formatTriggerReason(approval.triggeredBy, approval.approvalReason || null)}`,
            approval.expiresAt
              ? `**Expires:** ${new Date(approval.expiresAt).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          inline: false,
        },
      ])

    // Add Content GUIDs
    if (approval.contentGuids && approval.contentGuids.length > 0) {
      detailsEmbed.addFields([
        {
          name: 'Content GUIDs',
          value: approval.contentGuids.join('\n'),
          inline: false,
        },
      ])
    }

    // Add FULL Proposed Routing details
    if (approval.proposedRouterDecision?.approval?.proposedRouting) {
      const routing = approval.proposedRouterDecision.approval.proposedRouting
      const routingDetails = []

      // Instance information
      routingDetails.push(
        `**Instance:** ${routing.instanceType} Instance ${routing.instanceId}`,
      )

      // Quality Profile
      if (routing.qualityProfile) {
        routingDetails.push(`**Quality Profile:** ${routing.qualityProfile}`)
      }

      // Root Folder
      if (routing.rootFolder) {
        routingDetails.push(`**Root Folder:** ${routing.rootFolder}`)
      }

      // Search on Add with description
      if (routing.searchOnAdd !== undefined) {
        routingDetails.push(
          `**Search on Add:** ${routing.searchOnAdd ? 'Yes' : 'No'}`,
        )
        if (routing.searchOnAdd) {
          routingDetails.push(
            `└ Automatically search for ${approval.contentType === 'show' ? 'episodes' : 'movies'}`,
          )
        }
      }

      // Sonarr-specific settings
      if (routing.seasonMonitoring) {
        routingDetails.push(
          `**Season Monitoring:** ${routing.seasonMonitoring}`,
        )
      }
      if (routing.seriesType) {
        routingDetails.push(`**Series Type:** ${routing.seriesType}`)
      }

      // Radarr-specific settings
      if (routing.minimumAvailability) {
        routingDetails.push(
          `**Minimum Availability:** ${routing.minimumAvailability}`,
        )
      }

      // Tags
      if (routing.tags && routing.tags.length > 0) {
        routingDetails.push(`**Tags:** ${routing.tags.join(', ')}`)
      } else {
        routingDetails.push('**Tags:** None')
      }

      // Priority
      if (routing.priority !== undefined) {
        routingDetails.push(`**Priority:** ${routing.priority}`)
      }

      detailsEmbed.addFields([
        {
          name: 'Full Proposed Routing',
          value: routingDetails.join('\n'),
          inline: false,
        },
      ])
    } else {
      detailsEmbed.addFields([
        {
          name: 'Proposed Routing',
          value: 'No routing information available',
          inline: false,
        },
      ])
    }

    // Add approval history/notes if available
    if (approval.approvalNotes || approval.approvedBy) {
      const historyDetails = []
      if (approval.approvedBy) {
        historyDetails.push(`**Approved By:** User ${approval.approvedBy}`)
      }
      if (approval.approvalNotes) {
        historyDetails.push(`**Notes:** ${approval.approvalNotes}`)
      }

      detailsEmbed.addFields([
        {
          name: 'Approval History',
          value: historyDetails.join('\n'),
          inline: false,
        },
      ])
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_back_${approvalId}_${currentIndex}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      content: '',
      embeds: [detailsEmbed],
      components: [actionRow],
    })
  } catch (error) {
    log.error({ error, approvalId }, 'Error showing approval details')
    await interaction.editReply({
      content: '❌ Error loading approval details',
      embeds: [],
      components: [],
    })
  }
}

/**
 * Show next approval after an action (approve/reject)
 */
async function showNextApprovalAfterAction(
  interaction: ButtonInteraction,
  currentIndex: number,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    // Get fresh list of pending approvals
    const pendingApprovals = await fastify.db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      // No more approvals - show completion message
      const completionEmbed = new EmbedBuilder()
        .setTitle('✅ All Approvals Processed')
        .setDescription('No more pending approval requests!')
        .setColor(0x57f287)
        .setTimestamp()

      await interaction.editReply({
        content: '',
        embeds: [completionEmbed],
        components: [createBackToMenuButton()],
      })
      return
    }

    // Show the same index or first if current was processed
    const nextIndex = Math.min(currentIndex, pendingApprovals.length - 1)
    await showApprovalAtIndex(
      interaction,
      nextIndex,
      pendingApprovals,
      fastify,
      log,
    )
  } catch (error) {
    log.error({ error, currentIndex }, 'Error showing next approval')
    await interaction.editReply('❌ Error loading next approval')
  }
}

/**
 * Handle back button from details view
 */
async function handleApprovalBack(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
): Promise<void> {
  await interaction.deferUpdate()

  try {
    // Get all pending approvals to restore navigation context
    const pendingApprovals = await fastify.db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.editReply({
        content: '✅ No pending approval requests found!',
        embeds: [],
        components: [],
      })
      return
    }

    // Find the current approval in the list
    const approvalIndex = pendingApprovals.findIndex((a) => a.id === approvalId)
    const indexToShow =
      approvalIndex >= 0
        ? approvalIndex
        : Math.min(currentIndex, pendingApprovals.length - 1)

    // Restore the original approval message with navigation
    await showApprovalAtIndex(
      interaction,
      indexToShow,
      pendingApprovals,
      fastify,
      log,
    )
  } catch (error) {
    log.error({ error, approvalId, currentIndex }, 'Error handling back button')
    await interaction.editReply({
      content: '❌ Error restoring approval view',
      embeds: [],
      components: [],
    })
  }
}

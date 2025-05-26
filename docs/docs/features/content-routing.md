---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Advanced Content Routing

Pulsarr offers a powerful predicate-based routing system that intelligently directs content to the appropriate Sonarr/Radarr instances.

:::info Migration Note
If you're upgrading from a version prior to 0.2.15, you may need to delete and recreate your content routes if you experience routing issues.
:::

## Overview

The content routing system allows you to create complex rules that determine which Sonarr/Radarr instance should receive specific content based on multiple criteria. This enables you to organize your media library according to your preferences and setup.

<img src={useBaseUrl('/img/Content-Route-1.png')} alt="Content Router Interface" />

The content routing interface allows you to create complex rules with visual condition builders and comprehensive configuration options.

<img src={useBaseUrl('/img/Content-Route-2.png')} alt="Content Router Advanced Interface" />

The advanced interface provides detailed condition building and priority management for complex routing scenarios.

## Key Features

### Conditional Logic

The routing system supports complex decision trees with:

- **AND/OR Logic**: Combine multiple conditions with logical operators
- **Nested Condition Groups**: Create sophisticated rule hierarchies
- **Priority-based Processing**: Assign weights to rules to control precedence

### Multiple Criteria Types

Route content based on a wide range of metadata attributes:

- **Genre**: Send specific genres to dedicated instances (e.g., Anime → anime instance)
- **User**: Route specific users' content to designated profiles/folders
- **Language**: Direct content based on audio or subtitle language
- **Year**: Segregate content by release year (e.g., pre-2000 movies → classics folder)
- **Certification**: Organize by content rating (e.g., R-rated → separate folder)
- **Season**: Control routing based on series length (e.g., shows with more than 5 seasons → lower quality profile)

### Multi-Instance Routing

Content can be sent to multiple instances simultaneously when different rules match, allowing for:

- **Duplicate Content**: Maintain the same show/movie in multiple libraries
- **Quality Variations**: Keep different quality versions in different instances
- **Different Root Folders**: Store content in various locations based on your preferences

## Creating Routing Rules

### Basic Rule Structure

Each routing rule consists of:

1. **Conditions**: The criteria that content must match
2. **Target Instance**: The Sonarr/Radarr instance to receive matching content
3. **Instance Settings**: Quality profile, root folder, etc. for the specific instance
4. **Priority**: Determining which rule takes precedence when multiple match

### Example Rule Creation

#### Anime Rule Example

To create a rule that routes anime content to a dedicated instance:

1. Navigate to the Sonarr or Radarr configuration page
2. Click "Add Rule" under Content Routing
3. Set up conditions:
   - Select "Genre" as the condition type
   - Select "contains" as the operator
   - Enter "Anime" as the value
4. Configure the target instance:
   - Select your anime-focused Sonarr instance
   - Choose an appropriate quality profile
   - Select the desired root folder
5. Set a high priority to ensure anime content is always routed to this instance

#### User-based Rule Example

To create a rule that routes a specific user's content to a dedicated folder:

1. Navigate to the configuration page
2. Click "Add Rule" under Content Routing
3. Set up conditions:
   - Select "User" as the condition type
   - Select "equals" as the operator
   - Select the desired username
4. Configure the target instance:
   - Select the appropriate instance
   - Choose the quality profile for this user
   - Select a specific root folder for this user's content
5. Set the priority level for this rule

## Rule Processing Flow

When a new item is added to a watchlist, Pulsarr:

1. Evaluates all content routing rules
2. Identifies all matching rules
3. For rules targeting different instances:
   - Sends the content to all matching instances
4. For rules targeting the same instance:
   - Applies only the highest priority matching rule
   - Uses that rule's settings for quality profile, root folder, etc.

## Advanced Example

Here's a practical example of a complex routing setup:

```
Rule 1: IF genre contains "Anime" AND language equals "Japanese"
        THEN route to "Anime-Sonarr" with "HD-1080p" profile
        Priority: 100

Rule 2: IF genre contains "Anime" 
        THEN route to "Default-Sonarr" with "SD" profile
        Priority: 50

Rule 3: IF user equals "KidsAccount"
        THEN route to "Family-Sonarr" with "Family" profile
        Priority: 80
```

In this setup:
- Japanese anime goes to a dedicated instance with high quality
- Other anime goes to the default instance with lower quality
- All content from the kids' account goes to a family-friendly instance

## Troubleshooting

If content isn't being routed as expected:

1. **Check Rule Priority**: Ensure higher priority rules aren't overriding your rule
2. **Verify Conditions**: Content metadata must match exactly as specified in the rule
3. **Instance Connectivity**: Confirm that Pulsarr can communicate with all instances
4. **Review Logs**: Check Pulsarr logs for any errors in rule processing
5. **Test with Simple Rules**: Create basic rules to test functionality before adding complexity
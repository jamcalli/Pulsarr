import {
  blankQuotaField,
  QUOTA_FIELD_DEFAULTS,
  type QuotaFieldValues,
} from '@/lib/quota-fields'

const on: QuotaFieldValues = { ...QUOTA_FIELD_DEFAULTS, on: true }

describe('blankQuotaField', () => {
  it('is null when every type can save', () => {
    expect(blankQuotaField([on, on])).toBeNull()
    expect(blankQuotaField([])).toBeNull()
  })

  it('ignores a switched off type', () => {
    expect(
      blankQuotaField([{ ...QUOTA_FIELD_DEFAULTS, quotaLimit: undefined }]),
    ).toBeNull()
  })

  it('flags a blank limit', () => {
    expect(blankQuotaField([on, { ...on, quotaLimit: undefined }])).toBe(
      'limit',
    )
  })

  it('flags a blank cap that is switched on', () => {
    expect(blankQuotaField([{ ...on, capOn: true, cap: undefined }])).toBe(
      'cap',
    )
    expect(
      blankQuotaField([{ ...on, capOn: false, cap: undefined }]),
    ).toBeNull()
  })

  it('allows a blank cap under bypass', () => {
    expect(
      blankQuotaField([
        { ...on, capOn: true, cap: undefined, bypassApproval: true },
      ]),
    ).toBeNull()
  })

  it('reports a limit before a cap across types', () => {
    expect(
      blankQuotaField([
        { ...on, capOn: true, cap: undefined },
        { ...on, quotaLimit: undefined },
      ]),
    ).toBe('limit')
  })
})

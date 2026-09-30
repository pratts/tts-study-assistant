import {
  byteLength,
  emailSchema,
  LIMITS,
  noteSchema,
  passwordChangeSchema,
  passwordSchema,
  registerSchema,
  runeLength,
} from '@/lib/validation'

describe('length helpers match Go', () => {
  it('counts bytes like len() and code points like RuneCountInString', () => {
    expect(byteLength('é')).toBe(2)
    expect(byteLength('😀')).toBe(4)
    expect(runeLength('😀')).toBe(1) // String.length would say 2
    expect(runeLength('héllo')).toBe(5)
  })
})

describe('passwordSchema (bcrypt 72-byte limit)', () => {
  it('accepts 72 ASCII bytes and rejects 73', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false)
  })

  it('measures bytes, not characters', () => {
    expect(passwordSchema.safeParse('é'.repeat(36)).success).toBe(true) // 72 bytes
    expect(passwordSchema.safeParse('é'.repeat(37)).success).toBe(false) // 37 chars, 74 bytes
  })

  it('requires a value', () => {
    expect(passwordSchema.safeParse('').success).toBe(false)
  })
})

describe('emailSchema (Go net/mail plain address)', () => {
  it('trims and lower-cases like the backend', () => {
    expect(emailSchema.parse('  Alice@Example.COM ')).toBe('alice@example.com')
  })

  it.each(['a@b', 'first.last+tag@sub.example.co.uk', "o'hara@example.com", 'ü@example.com'])('accepts %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(true)
  })

  it.each(['', 'plain', 'Bob <bob@example.com>', 'a@@b', '.a@b', 'a.@b', 'a..b@c', 'a b@c', '"q"@example.com'])('rejects %s', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false)
  })

  it('limits the address to 254 bytes', () => {
    expect(emailSchema.safeParse('a'.repeat(248) + '@b.com').success).toBe(true)
    expect(emailSchema.safeParse('a'.repeat(249) + '@b.com').success).toBe(false)
  })
})

describe('registerSchema', () => {
  it('limits names to 100 code points after trimming', () => {
    const base = { email: 'a@b.com', password: 'pw' }
    expect(registerSchema.safeParse({ ...base, name: '😀'.repeat(100) }).success).toBe(true)
    expect(registerSchema.safeParse({ ...base, name: '😀'.repeat(101) }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, name: '   ' }).success).toBe(false)
  })
})

describe('passwordChangeSchema', () => {
  it('requires the confirmation to match', () => {
    const result = passwordChangeSchema.safeParse({ oldPassword: 'a', newPassword: 'b', confirmPassword: 'c' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword'])
  })
})

describe('noteSchema', () => {
  const valid = { content: 'x', sourceUrl: '', sourceTitle: '', domain: '' }

  it('rejects empty or whitespace-only content', () => {
    expect(noteSchema.safeParse({ ...valid, content: '' }).success).toBe(false)
    expect(noteSchema.safeParse({ ...valid, content: '  \n ' }).success).toBe(false)
  })

  it('applies the backend limits', () => {
    expect(noteSchema.safeParse({ ...valid, content: '😀'.repeat(LIMITS.contentRunes) }).success).toBe(true)
    expect(noteSchema.safeParse({ ...valid, content: 'a'.repeat(LIMITS.contentRunes + 1) }).success).toBe(false)
    expect(noteSchema.safeParse({ ...valid, sourceUrl: 'https://x.com/' + 'é'.repeat(1020) }).success).toBe(false)
    expect(noteSchema.safeParse({ ...valid, sourceTitle: 'a'.repeat(513) }).success).toBe(false)
    expect(noteSchema.safeParse({ ...valid, domain: 'a'.repeat(254) }).success).toBe(false)
  })
})

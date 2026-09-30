import { ApiError, MESSAGES } from '@/api/client'
import { applyServerError, errorMessage } from '@/lib/forms'

describe('applyServerError', () => {
  it('puts field errors on their inputs', () => {
    const setError = vi.fn()
    applyServerError(setError, new ApiError(400, 'Invalid', { fields: { email: 'Taken', source_url: 'Bad' } }), {
      source_url: 'sourceUrl',
    })
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Taken' })
    expect(setError).toHaveBeenCalledWith('sourceUrl', { type: 'server', message: 'Bad' })
    expect(setError).not.toHaveBeenCalledWith('root.server', expect.anything())
  })

  it('puts everything else on the form', () => {
    const setError = vi.fn()
    applyServerError(setError, new ApiError(409, 'Email already taken'))
    expect(setError).toHaveBeenCalledWith('root.server', { message: 'Email already taken' })
  })

  it('never shows unknown errors verbatim', () => {
    const setError = vi.fn()
    applyServerError(setError, new Error('TypeError: x is undefined'))
    expect(setError).toHaveBeenCalledWith('root.server', { message: MESSAGES.server })
    expect(errorMessage(new Error('internal detail'))).toBe(MESSAGES.server)
  })
})

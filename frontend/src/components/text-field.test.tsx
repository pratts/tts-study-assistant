import { render, screen } from '@testing-library/react'
import { TextField } from '@/components/text-field'

describe('TextField', () => {
  it('caps multiline inputs so long text scrolls inside the box', () => {
    render(<TextField id="c" label="Content" multiline registration={{ name: 'c', onBlur: async () => {}, onChange: async () => {}, ref: () => {} }} />)
    expect(screen.getByLabelText('Content')).toHaveClass('max-h-60', 'overflow-y-auto')
  })
})

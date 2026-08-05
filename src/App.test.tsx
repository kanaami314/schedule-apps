import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the heading without crashing', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'くるリズム' })).toBeInTheDocument()
  })
})

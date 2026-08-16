import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Tile } from './Tile'

/** Tile renders an <li>, so give it the list its markup expects. */
const inGrid: Decorator = (Story) => (
  <ul aria-label="Shitposts" className="grid">
    <Story />
  </ul>
)

const meta = {
  title: 'Tile',
  component: Tile,
  decorators: [inGrid],
} satisfies Meta<typeof Tile>

export default meta

type Story = StoryObj<typeof meta>

export const Tagged: Story = {
  args: {
    shitpost: {
      shitpostKey: 'media/cat.png',
      uploadedAt: '2026-03-09T11:20:00.000Z',
      tags: ['cats', 'chaos'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    expect(canvas.getByAltText('Shitpost tagged cats, chaos')).toBeInTheDocument()
    expect(canvas.getByText('9 Mar 2026')).toBeVisible()
  },
}

export const Untagged: Story = {
  args: {
    shitpost: {
      shitpostKey: 'media/cat.png',
      uploadedAt: '2026-03-09T11:20:00.000Z',
      tags: [],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    expect(canvas.getByAltText('Shitpost with no tags')).toBeInTheDocument()
    expect(canvas.queryByLabelText('Tags')).not.toBeInTheDocument()
  },
}

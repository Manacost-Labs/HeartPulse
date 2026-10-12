import type { Meta, StoryObj } from '@storybook/react-vite';
import CardGalleryImage from './ConstructedCardGalleryImage';
import '../modules/constructedCards/public.css';

const thumbnail = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="497"><rect width="360" height="497" rx="30" fill="#791e23"/><rect x="18" y="18" width="324" height="461" rx="22" fill="#f7e8bf"/><text x="180" y="240" text-anchor="middle" fill="#791e23" font-size="32">HearthPulse</text></svg>')}`;
const meta = {
  title: 'Cards/Gallery image',
  component: CardGalleryImage,
  args: { src: thumbnail, alt: 'Пример карты', immediate: true, highPriority: true },
  decorators: [Story => <div style={{ width: 200, minHeight: 277 }}><Story /></div>],
} satisfies Meta<typeof CardGalleryImage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstRow: Story = {};
export const ResponsiveRow: Story = { args: { immediate: false, highPriority: false, minWidth: 641 } };
export const DeferredRow: Story = { args: { immediate: false, highPriority: false } };

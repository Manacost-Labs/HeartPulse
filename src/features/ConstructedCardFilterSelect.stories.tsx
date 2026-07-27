import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import ConstructedCardFilterSelect from './ConstructedCardFilterSelect';
import {
  classFilterOptions,
  numericFilterOptions,
  rarityFilterOptions,
  setFilterOptions,
  textFilterOptions,
} from './constructedCardFilterOptions';
import './StandardCards.css';

const meta = {
  title: 'Constructed cards/Filter select',
  component: ConstructedCardFilterSelect,
  decorators: [
    Story => (
      <div className="constructed-cards" style={{ width: 320, minHeight: 480, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Класс',
    value: '',
    options: classFilterOptions(['DEATHKNIGHT', 'MAGE', 'PRIEST', 'WARRIOR']),
    onChange: fn(),
    visual: 'class',
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ConstructedCardFilterSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledClassFilter() {
  const [value, setValue] = useState('');
  return (
    <ConstructedCardFilterSelect
      label="Класс"
      value={value}
      options={classFilterOptions(['DEATHKNIGHT', 'MAGE', 'PRIEST', 'WARRIOR'])}
      onChange={setValue}
      visual="class"
    />
  );
}

export const KeyboardSelection: Story = {
  render: () => <ControlledClassFilter />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /Класс Все классы/i });
    await userEvent.click(trigger);
    await expect(canvas.getByRole('listbox', { name: 'Класс' })).toBeVisible();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.getByRole('button', { name: /Класс Рыцарь смерти/i })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: /Класс Рыцарь смерти/i }));
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('listbox', { name: 'Класс' })).not.toBeInTheDocument();
  },
};

export const ExpansionLogos: Story = {
  args: {
    label: 'Дополнение',
    options: setFilterOptions(['ESCAPEFROM_VIOLET_HOLD', 'CATACLYSM', 'TIME_TRAVEL']),
    visual: 'set',
  },
};

export const ExistingRarityGems: Story = {
  args: {
    label: 'Редкость',
    options: rarityFilterOptions(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']),
    visual: 'rarity',
  },
};

export const AttackIcon: Story = {
  args: {
    label: 'Атака',
    options: numericFilterOptions('Любая', '/constructed-filter-icons/attack.webp'),
    visual: 'stat',
  },
};

export const TextOnlyMechanics: Story = {
  args: {
    label: 'Механики',
    options: textFilterOptions('Все механики', ['BATTLECRY', 'TAUNT', 'DIVINE_SHIELD'], value => ({
      BATTLECRY: 'Боевой клич',
      TAUNT: 'Провокация',
      DIVINE_SHIELD: 'Божественный щит',
    })[value] || value),
    visual: 'text',
  },
};

import React, { useState } from 'react';
import '../public.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { LibraryControls } from './LibraryControls';

function ControlsExample() {
  const [races, setRaces] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('minion');
  const [pool, setPool] = useState('current');
  const [tiers, setTiers] = useState<string[]>([]);
  const [duos, setDuos] = useState(false);
  const [mechanic, setMechanic] = useState('ALL');
  const reset = () => { setRaces([]); setQuery(''); setTiers([]); setDuos(false); setMechanic('ALL'); };
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  return <div className="arena-app-battlegrounds"><div className="bg-library-page">
    <LibraryControls
      sections={[{ value: 'minion', label: 'Существа' }, { value: 'spell', label: 'Заклинания' }]}
      pools={[{ value: 'current', label: 'Актуальный пул' }, { value: 'archive', label: 'Архив' }]}
      section={section} pool={pool} onSection={setSection} onPool={setPool}
      query={query} onQuery={setQuery} tiers={tiers} onTier={value => setTiers(toggle(tiers, value))} onClearTiers={() => setTiers([])}
      races={[[ 'aberration', 'Аберрация' ], ['undead', 'Нежить'], ['dragon', 'Дракон'], ['mech', 'Механизм'], ['murloc', 'Мурлок'], ['demon', 'Демон'], ['quilboar', 'Свинобраз'], ['naga', 'Нага'], ['pirate', 'Пират'], ['beast', 'Зверь'], ['elemental', 'Элементаль']]}
      selectedRaces={races} onRace={value => setRaces(toggle(races, value))} onClearRaces={() => setRaces([])}
      mechanics={[[ 'BATTLECRY', 'Боевой клич' ], ['TAUNT', 'Провокация'], ['DEATHRATTLE', 'Предсмертный хрип']]} mechanic={mechanic} onMechanic={setMechanic}
      groups={[]} group="ALL" onGroup={() => {}}
      duos={duos} onDuos={() => setDuos(!duos)}
      selections={races.map(value => ({ id: value, label: 'Аберрация', remove: () => setRaces([]) }))}
      onReset={reset} resultCount={races.length ? 25 : 273} totalCount={303}
    />
  </div></div>;
}
const meta = { title: 'Battlegrounds/LibraryControls', component: ControlsExample, parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ControlsExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Compact: Story = {
  play: async ({ canvas }) => {
    const tavern = canvas.getByRole('button', { name: /^Таверна 3$/ });
    await userEvent.click(tavern);
    await expect(tavern).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: /^Все$/ }));
    await expect(tavern).toHaveAttribute('aria-pressed', 'false');
    const race = canvas.getByRole('button', { name: 'Аберрация' });
    await userEvent.click(race);
    await expect(race).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('status')).toHaveTextContent('25 найдено');
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить всё' }));
    await expect(race).toHaveAttribute('aria-pressed', 'false');
  },
};

export const AdvancedFilters: Story = {
  play: async ({ canvas, canvasElement }) => {
    const summary = canvasElement.querySelector('summary');
    const initialWidth = summary?.getBoundingClientRect().width;
    await userEvent.click(canvas.getByText('Дополнительно'));
    await expect(summary?.getBoundingClientRect().width).toBe(initialWidth);
    const duos = canvas.getByRole('checkbox', { name: 'Показывать карты Duo' });
    await userEvent.click(duos);
    await expect(duos).toBeChecked();
    const mechanic = canvas.getByRole('combobox', { name: 'Механика' });
    await userEvent.selectOptions(mechanic, 'BATTLECRY');
    await expect(mechanic).toHaveValue('BATTLECRY');
    await userEvent.click(canvas.getByRole('button', { name: 'Провокация' }));
    await expect(mechanic).toHaveValue('TAUNT');
    await userEvent.click(canvas.getByText('Дополнительно'));
    await expect(canvas.getByLabelText('Активных дополнительных фильтров: 2')).toBeVisible();
    await expect(summary?.getBoundingClientRect().width).toBe(initialWidth);
  },
};

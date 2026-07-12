import { useId, useState } from 'react';
import './FAQSection.css';

const FAQ_ITEMS = [
  {
    q: 'Какой класс лучший на Арене Hearthstone?',
    a: 'По данным HSReplay и Firestone, в текущем патче топ-3 классы меняются с каждым обновлением. Актуальный рейтинг классов по проценту побед смотрите на странице «Классы».',
  },
  {
    q: 'Как пользоваться тир-листом карт?',
    a: 'Выберите класс в верхней панели тир-листа, чтобы увидеть оценки всех карт именно для него. Карты класса S — авто-пик, A — отличные, B — хорошие, C и ниже — ситуативные.',
  },
  {
    q: 'Как выбрать легендарку на Арене?',
    a: 'На старте Арены вам предлагают группу из трёх легендарных карт. Выбирайте ту группу, у которой наивысший процент побед — это показывает страница «Легендарки».',
  },
  {
    q: 'Как часто обновляются данные?',
    a: 'Данные о винрейтах классов и тир-лист карт обновляются автоматически несколько раз в сутки на основе HSReplay, Firestone и HearthArena.',
  },
  {
    q: 'Что такое винрейт класса на Арене?',
    a: 'Винрейт — процент матчей, выигранных игроками этого класса. Например, 55% означает, что из 100 партий класс выигрывает в среднем 55.',
  },
  {
    q: 'Сколько побед нужно для окупаемости Арены?',
    a: 'Для полной окупаемости (получить золото ≥ стоимости входа) обычно нужно 7+ побед. При 12 победах вы получаете максимальные награды.',
  },
] as const;

export default function FAQSection() {
  const headingId = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section aria-labelledby={headingId} className="mt-8 mb-2">
      <h2 id={headingId} className="font-hs text-[#3d2208] text-xl mb-4">Частые вопросы</h2>
      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, index) => {
          const expanded = open === index;
          const panelId = `${headingId}-panel-${index}`;
          return (
            <div key={item.q} className="faq-card rounded-xl overflow-hidden" style={{ border: '1.5px solid #c4a46a', background: 'linear-gradient(135deg,#f5ead0,#ede0c0)' }}>
              <button
                type="button"
                className="w-full text-left flex items-center justify-between px-4 py-3 gap-2"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                aria-controls={panelId}
              >
                <span className="font-hs text-[#3d2208] text-sm sm:text-base">{item.q}</span>
                <span aria-hidden="true" className="flex-shrink-0 text-[#8b4513] font-bold text-lg leading-none">{expanded ? '−' : '+'}</span>
              </button>
              <div id={panelId} className="px-4 pb-4 pt-1" hidden={!expanded}>
                <p className="text-[#5c3a21] text-sm leading-relaxed">{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

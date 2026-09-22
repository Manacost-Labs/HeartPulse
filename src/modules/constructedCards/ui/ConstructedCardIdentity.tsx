import type { ReactNode } from 'react';

export type ConstructedCardIdentityProps = {
  name: string;
  englishName?: string | null;
  classIconUrl: string;
  facts: Array<{ label: string; value: ReactNode }>;
  rulesText: string;
  flavorText?: string;
};

export function ConstructedCardIdentity(props: ConstructedCardIdentityProps) {
  return <div className="constructed-card-detail__identity">
    <div className="constructed-card-detail__title" data-tour-id="card-identity">
      <img src={props.classIconUrl} alt="" /><div><h1>{props.name}</h1><p>{props.englishName}</p></div>
    </div>
    <dl className="constructed-card-detail__meta">
      {props.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>
    <div className="constructed-card-detail__copy">
      <h2>Описание</h2><p>{props.rulesText}</p>
      {props.flavorText && <><h3>Художественный текст</h3><blockquote>{props.flavorText}</blockquote></>}
    </div>
  </div>;
}

export type HelpQuestion = {
  id: string;
  question: string;
  answer: string;
  keywords?: string;
  link?: { label: string; href: string; external?: boolean };
};

export type HelpSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: HelpQuestion[];
};


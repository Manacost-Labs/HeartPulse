export type PublicBattlegroundHero = {
  dbfId: number;
  cardId: string | null;
  name: string;
  image: string | null;
  heroPower: {
    name: string;
    text: string | null;
    image: string | null;
  } | null;
};

export type Contest = {
  id: string;
  title: string;
  description: string;
  prize: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  status: string;
  winners: string[];
  entry?: { status: string; createdAt: string } | null;
  entriesCount?: number;
};

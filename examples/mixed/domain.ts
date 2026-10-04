export interface User {
  name: string;
  score: number;
}

export enum Status {
  Active = 'active',
}
export const users: User[] = [
  { name: 'Ada', score: 12 },
  { name: 'Lin', score: 9 },
];

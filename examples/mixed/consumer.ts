import { summarize, status, type User } from './service.twill';
import { users } from './domain.ts';

export async function run() {
  const input: User[] = users;
  const summaries: string[] = summarize(input);
  return { summaries, status: await status() };
}

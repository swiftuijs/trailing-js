/** @param {import('./domain.ts').User} user */
export function format(user) {
  return `${user.name}: ${user.score}`;
}

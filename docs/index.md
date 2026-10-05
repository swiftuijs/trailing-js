---
layout: page
sidebar: false
aside: false
title: Clearer flow. Same TypeScript.
titleTemplate: ':title | Twill'
description: Make validation, cleanup and business states explicit. Twill compiles to ordinary JavaScript and keeps your TypeScript types, libraries and tools.
---

<TwillHome>
<template #hero>

```twill
async function readOwned(acquire) {
  const resource = await acquire();
  defer {
    await resource.close();
  }

  guard const name = await resource.read() else {
    return 'Missing';
  }
  return name.toUpperCase();
}
```

</template>
<template #validation-ts>

```ts
const user = findUser(id);
if (user == null) {
  return 'Missing';
}
return user.name;
```

</template>
<template #validation-twill>

```twill
guard const user = findUser(id) else {
  return 'Missing';
}
return user.name;
```

</template>
<template #cleanup-ts>

```ts
const document = await acquire();
try {
  return await document.readText();
} finally {
  await document.close();
}
```

</template>
<template #cleanup-twill>

```twill
const document = await acquire();
defer { await document.close(); }
return await document.readText();
```

</template>
<template #states-ts>

```ts
function describe(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'ok':
      return outcome.value.toFixed(2);
    case 'error':
      return outcome.message;
  }
  outcome satisfies never;
  throw new TypeError('Unexpected outcome');
}
```

</template>
<template #states-twill>

```twill
function describe(outcome: Outcome): string {
  return switch (outcome) {
    case { kind: 'ok', value }: value.toFixed(2);
    case { kind: 'error', message }: message;
  };
}
```

</template>
<template #callbacks-ts>

```ts
const names = users.filter((user) => user.active).map((user) => user.name);
```

</template>
<template #callbacks-twill>

```twill
const names = users.filter { user in
  user.active;
}.map { user in
  user.name;
};
```

</template>
</TwillHome>

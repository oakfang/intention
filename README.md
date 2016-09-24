# feffect
Create truly pure functional runtime envs

## The goals
- Separate pure functions from impure functions in a clear, composable manner, using ES2015.
- Create easily testable logics, even impure ones
- Easy inter-op with "regular" JS

## Installation
`npm i -S feffect`

##Usage
```js
// index.js
const {
  effect, // the most basic atom for `feffect`
  impure,
  run,
} = require('feffect')();
const world = require('./world');

// all this function does is to create an effect-intention.
// nothing actually gets executed here, this is truly pure.
const request = options => effect('write:net', { options });
const log = (...args) => effect('write:log', { args });

const main = impure(function* (url) {
  // yielding from an impure function
  // ACTUALLY executes the world's interpretation of the 'write:net' effect, see below
  const body = yield request(url);
  yield log(body);
});

// calling an impure function simply returns another effect, though
const mainEffect = main('http://example.com');

// the `run` function converts an effect (intention) into a Promise (action),
// according to the world's interpretation of the effect's type
run(mainEffect, world)
  .then(() => console.log('DONE'))
  .catch(() => console.error('Boo!'));

// world.js
const request = require('request');

// A world object must handle every type of effect the program uses.
// the handler receives 3 parameters:
// - the object passed as the effect's second parameter
// - a resolver function that marks the effect as successful with an optional value
// - a rejecter function that marks the effect as failed with an optional value
// You might notice that we don't explicitly handle any effect type which starts with
// the `impure:` prefix. These are reserved for internal usage.
module.exports = {
  'write:net': ({ options }, resolve, reject) => request(options, (err, resp, body) => {
    if (err) return reject(err);
    if (resp.statusCode >= 400) return reject(resp);
    return resolve(body);
  }),
  'write:log': ({ args }, resolve) => resolve(console.log(...args)),
};
```

## API
### `require('feffect')`
Requiring `feffect` returns a function that, when called, creates an entirely new functional environment,
with the API below.

### `env.effect(effectType, [effectParameters])`
This is the most basic part of `feffect`. Every `effect` has a type, and an optional parameters object.
Effects are immutable, with no way to gain direct access to their properties (not even a `get` access), except via `ensure` (below).
Every effect type should be handled explicitly as part of a `world` object (again, below).

### `env.ensure(effect, [type, [params]])`
When provided a single parameter, this function simply ensures it is an effect belonging to this `env`. When given a `type`, it also checks for type equality. When also given `params`, it checks that for every key in the `params` object, its value equals (`===`) the effect's.

Example:
```js
const eft = effect('read:file', { path: './foo' })
ensure(eft) // true
ensure(eft, 'read:file') // true
ensure(eft, 'read:file', { path: './foo' }) // true
ensure(eft, 'write:file') // false
ensure(eft, 'read:file', { filePath: './foo' }) // false
ensure(eft, 'read:file', { path: './_foo' }) // false
```

### `env.impure(generatorFunction)`
This function accepts a generator function that can `yield` `effect` objects, and get back their resolved values.
It returns a function, that when called, does nothing but return an `effect` object of type `impure:call`.

### `env.run(effect, world)`
This function converts an `effect` (which is a symbol for an intent) into a `Promise` (which is a symbol for an action), via the `world` parameter's interpretation of the `effect`.
Should the `effect` type not be handled by the `world`, this function `rejects` immediately.

### `env.concurrent(effects)`
This function returns an effect of the `impure:concurrent` type,
which has a default interpretation of interpreting all effects in its `effects` parameter, according to the same world that interprets itself, and resolves with an array of the return values in the same order as their respective effects. Basically, `concurrent` is to `effect` objects, as `Promise.all` is to `Promise` objects.

### The `world` object
The `world` object passed to the `run` function is not magic, but a plain JS object. For every type of `effect` your `env` uses, you must include it as a property of the world, with a value that looks like so:
`(effectParams, resolve, reject) => effectParams.shouldWork ? resolve(10) : reject(new Error('Meow'))`
Basically, use `resolve` to mark (with a possible value) a successful side-effect, and `reject` to mark a failed one - just like with a `Promise`.

## Usage in testing
It is highly advised to test your entire program's logic with different `world` objects to simulate as many possible scenarios as you feel appropriate, while testing your *actual* `world` object separately, using `Promises`.

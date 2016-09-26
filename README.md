# intentions
>The road to functional programming is paved with pure intentions

Create truly pure functional runtime environments

## The goals
- Separate pure functions from impure functions in a clear, composable manner, using ES2015.
- Create easily testable logics, even impure ones
- Easy inter-op with "regular" JS

## Installation
`npm i -S intentions`

##Usage
```js
// index.js
const {
  intent, // the most basic atom for `intention`
  impure,
  interpret,
} = require('intentions');
const reality = require('./reality');

// all this function does is to create an intention.
// nothing actually gets executed here, this is truly pure.
const request = options => intent('write:net', { options });
const log = (...args) => intent('write:log', { args });

const main = impure(function* (url) {
  // yielding from an impure function
  // ACTUALLY executes the reality's interpretation of the 'write:net' intent, see below
  const body = yield request(url);
  yield log(body);
});

// calling an impure function simply returns another intent, though
const mainIntent = main('http://example.com');

// the `interpret` function converts an intent (intention) into a Promise (action),
// according to the reality's interpretation of the intent's type
interpret(mainIntent, reality)
  .then(() => console.log('DONE'))
  .catch(() => console.error('Boo!'));

// reality.js
const request = require('request');

// A reality object must handle every type of intent the program uses.
// the handler receives 3 parameters:
// - the object passed as the intent's second parameter
// - a resolver function that marks the intent as successful with an optional value
// - a rejecter function that marks the intent as failed with an optional value
// You might notice that we don't explicitly handle any intent type which starts with
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
### `require('intention')`
Requiring `intention` returns a function that, when called, creates an entirely new functional environment,
with the API below. It **also** returns the default environment.

### `env.intent(intentType, [intentParameters])`
This is the most basic part of `intention`. Every `intent` has a type, and an optional parameters object.
Intentions are immutable, with no way to gain direct access to their properties (not even a `get` access), except via `ensure` (below).
Every intent type should be handled explicitly as part of a `reality` object (again, below).

### `env.ensure(intent, [type, [params]])`
When provided a single parameter, this function simply ensures it is an intent belonging to this `env`. When given a `type`, it also checks for type equality. When also given `params`, it checks that for every key in the `params` object, its value equals (`===`) the intent's.

Example:
```js
const eft = intent('read:file', { path: './foo' })
ensure(eft) // true
ensure(eft, 'read:file') // true
ensure(eft, 'read:file', { path: './foo' }) // true
ensure(eft, 'write:file') // false
ensure(eft, 'read:file', { filePath: './foo' }) // false
ensure(eft, 'read:file', { path: './_foo' }) // false
```

### `env.impure(generatorFunction)`
This function accepts a generator function that can `yield` `intent` objects, and get back their resolved values.
It returns a function, that when called, does nothing but return an `intent` object of type `impure:call`.

### `env.interpret(intent, reality)`
This function converts an `intent` (which is a symbol for an intent) into a `Promise` (which is a symbol for an action), via the `reality` parameter's interpretation of the `intent`.
Should the `intent` type not be handled by the `reality`, this function `rejects` immediately.

### `env.concurrent(intents)`
This function returns an intent of the `impure:concurrent` type,
which has a default interpretation of interpreting all intents in its `intents` parameter, according to the same reality that interprets itself, and resolves with an array of the return values in the same order as their respective intents. Basically, `concurrent` is to `intent` objects, as `Promise.all` is to `Promise` objects.

### The `reality` object
The `reality` object passed to the `interpret` function is not magic, but a plain JS object. For every type of `intent` your `env` uses, you must include it as a property of the reality, with a value that looks like so:
`(intentParams, resolve, reject) => intentParams.shouldWork ? resolve(10) : reject(new Error('Meow'))`
Basically, use `resolve` to mark (with a possible value) a successful side-effect, and `reject` to mark a failed one - just like with a `Promise`.

## Usage in testing
It is highly advised to test your entire program's logic with different `reality` objects to simulate as many possible scenarios as you feel appropriate, while testing your *actual* `reality` object separately, using `Promises`.

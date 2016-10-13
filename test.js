import test from 'ava';
import create from '.';

const { intent, impure, interpret, isIntent, concurrent } = create();

const readFile = (path, options) => intent('read:file', { path, options });
const log = (...args) => intent('write:log', { args });
const numberOfLines = text => text.split('\n').length;

const main = impure(function* () {
  const content = yield readFile('./foo');
  yield log(numberOfLines(content));
});

test('Basic intents are true', t => {
  const eft = readFile('./foo');
  t.is(isIntent(eft), true);
  t.is(eft.type, 'read:file');
  t.is(eft.values.path, './foo');
  t.is(eft.values.options, undefined);
});

test('Impure functions are intents', t => {
  const eft = main();
  t.is(isIntent(eft), true);
  t.is(eft.type, 'impure:call');
});

test('Intents are immutable', t => {
  const eft = readFile('./foo');
  t.is(isIntent(eft), true);
  try {
    eft.values.path = 'meow';
    t.fail('Should fail');
  } catch (e) {
    t.is(eft.values.path, './foo');
  }
});

test('interpret fails on unknown intent types', async t => {
  try {
    await interpret(intent('meow'), {});
    t.fail('Should fail');
  } catch (e) {
    t.is(e.message, "Unhandled intent type 'meow'");
  }
});

test('interpret works when no errors', async t => {
  const reality = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
    'write:log': ({ args }, resolve, reject) => args[0] === 3 ? resolve() : reject(),
  };
  await interpret(main(), reality);
  t.pass('All is well');
});

test('interpret rejects when errors', async t => {
  const reality = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
    'write:log': ({ args }, resolve, reject) => reject(5),
  };
  try {
    await interpret(main(), reality);
    t.fail('Should have failed');
  } catch (e) {
    t.is(e, 5);
  }
});

test('Impure should only yield intents', async t => {
  try {
    await interpret(impure(function* () {
      yield 5;
    })(), {});

    t.fail('Should have failed');
  } catch (e) {
    t.is(e.message, 'Do not yield non-intents from an impure function');
  }
});

test('Impure explicit return', async t => {
  const read = impure(function* () {
    const n = numberOfLines(yield readFile('./'));
    return n;
  });

  const reality = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
  };
  const n = await interpret(read(), reality);
  t.is(n, 3);
});

test('concurrent intent type', t => {
  const intents = [intent('foo'), intent('bar')];
  const conc = concurrent(intents);
  t.is(isIntent(conc), true);
  t.is(conc.type, 'impure:concurrent');
  t.is(conc.values.intents[0].type, intents[0].type);
});

test('concurrent resolution works', async t => {
  const intents = [intent('foo'), intent('bar')];
  const reality = {
    foo(_, resolve) { resolve(5) },
    bar(_, resolve) { resolve(3) },
  };
  let [foo, bar] = await interpret(concurrent(intents), reality);
  t.is(foo, 5);
  t.is(bar, 3);
  reality.foo = (_, __, reject) => reject(7);
  try {
    await interpret(concurrent(intents), reality);
    t.fail('Should fail');
  } catch (e) {
    t.is(e, 7);
  }
});

test('Default realities clash', t =>
  t.is(isIntent(create.intent('meow')), false));

test('Nested intentions are unwrapped', async t => {
  const reality = {
    foo(_, resolve) { resolve(intent('bar')) },
    bar(_, resolve) { resolve(3) },
  };
  t.is(await interpret(intent('foo'), reality), 3);
});


test('Nested intention-errors are unwrapped', async t => {
  const reality = {
    foo(_, _resolve, reject) { reject(intent('bar')) },
    bar(_, resolve) { resolve(3) },
  };
  t.is(await interpret(intent('foo'), reality), 3);
});

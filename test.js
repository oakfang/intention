import test from 'ava';
import create from '.';

const { intent, impure, interpret, ensure, concurrent } = create();

const readFile = (path, options) => intent('read:file', { path, options });
const log = (...args) => intent('write:log', { args });
const numberOfLines = text => text.split('\n').length;

const main = impure(function* () {
  const content = yield readFile('./foo');
  yield log(numberOfLines(content));
});

test('Basic intents are true', t => {
  const eft = readFile('./foo');
  t.truthy(ensure(eft, 'read:file', {
    path: './foo',
    options: undefined,
  }));
});

test('Impure functions are intents', t => {
  const eft = main();
  t.truthy(ensure(eft, 'impure:call'));
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
  t.truthy(ensure(concurrent(intents), 'impure:concurrent', {
    intents,
  }));
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
  t.is(ensure(create.intent('meow')), false));

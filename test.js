import test from 'ava';
import env from '.';

const { effect, impure, run, ensure } = env();

const readFile = (path, options) => effect('read:file', { path, options });
const log = (...args) => effect('write:log', { args });
const numberOfLines = text => text.split('\n').length;

const main = impure(function* () {
  const content = yield readFile('./foo');
  yield log(numberOfLines(content));
});

test('Basic effects are true', t => {
  const eft = readFile('./foo');
  t.truthy(ensure(eft, 'read:file', {
    path: './foo',
    options: undefined,
  }));
});

test('Impure functions are effects', t => {
  const eft = main();
  t.truthy(ensure(eft, 'impure:call'));
});

test('Run fails on unknown effect types', async t => {
  try {
    await run(effect('meow'), {});
    t.fail('Should fail');
  } catch (e) {
    t.is(e.message, "Unhandled effect type 'meow'");
  }
});

test('Run works when no errors', async t => {
  const world = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
    'write:log': ({ args }, resolve, reject) => args[0] === 3 ? resolve() : reject(),
  };
  await run(main(), world);
  t.pass('All is well');
});

test('Run rejects when errors', async t => {
  const world = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
    'write:log': ({ args }, resolve, reject) => reject(5),
  };
  try {
    await run(main(), world);
    t.fail('Should have failed');
  } catch (e) {
    t.is(e, 5);
  }
});

test('Impure should only yield effects', async t => {
  try {
    await run(impure(function* () {
      yield 5;
    })(), {});
    t.fail('Should have failed');
  } catch (e) {
    t.is(e.message, 'Do not yield non-effects from an impure function');
  }
});

test('Impure explicit return', async t => {
  const read = impure(function* () {
    const n = numberOfLines(yield readFile('./'));
    return n;
  });
  const world = {
    'read:file': (params, resolve) => resolve('foo\nbar\nbuzz'),
  };
  const n = await run(read(), world);
  t.is(n, 3);
});

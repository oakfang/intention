module.exports = function env() {
  const effects = new WeakMap();
  const ensure = (e, type, params) => {
    const eft = effects.get(e);
    if (!type) return !!eft;
    return (
      eft.type === type &&
      (!params ||
       Object.keys(params).reduce((flag, p) =>
        flag && eft.values[p] === params[p], true)
      )
    );
  };

  const impureHandler = ({ gen, args, world }, resolve, reject) => {
    const it = gen(...args);
    let ret;
    const iterate = (val, err) => {
      try {
        ret = err ? it.throw(err) : it.next(val);
      } catch (e) {
        return reject(e);
      }
      if (!ret.done) {
        if (ensure(ret.value)) {
          run(ret.value, world).then(iterate).catch(err => iterate(null, err));
        } else {
          return reject(new Error('Do not yield non-effects from an impure function'));
        }
      } else {
        return resolve(ret.value);
      }
    };
    iterate();
  };

  const concurrentHanler = ({ effects, world }, resolve, reject) =>
    Promise.all(effects.map(e => run(e, world))).then(resolve).catch(reject);

  const run = (e, world) => new Promise((resolve, reject) => {
    world = Object.assign({
      'impure:call': (params, resolve, reject) => impureHandler(Object.assign({
        world,
      }, params), resolve, reject),
      'impure:concurrent': (params, resolve, reject) => concurrentHanler(Object.assign({
        world,
      }, params), resolve, reject),
    }, world);
    const { type, values } = effects.get(e);
    const handler = world[type];
    if (!handler) return reject(new Error(`Unhandled effect type '${type}'`));
    return handler(values, resolve, reject);
  });

  const effect = (type, values) => {
    const e =  Object.create(null);
    effects.set(e, { type, values });
    return e;
  }

  const impure = gen => (...args) => effect('impure:call', {
    args,
    gen,
  });

  const concurrent = effects => effect('impure:concurrent', {
    effects,
  });

  return {
    ensure,
    effect,
    run,
    impure,
    concurrent,
  }
};

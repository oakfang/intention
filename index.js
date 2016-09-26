function create() {
  const intents = new WeakMap();
  const ensure = (it, type, params) => {
    const intent = intents.get(it);
    if (!type) return !!intent;
    return (
      intent.type === type &&
      (!params ||
       Object.keys(params).reduce((flag, p) =>
        flag && intent.values[p] === params[p], true)
      )
    );
  };

  const impureHandler = ({ gen, args, reality }, resolve, reject) => {
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
          interpret(ret.value, reality).then(iterate).catch(err => iterate(null, err));
        } else {
          return reject(new Error('Do not yield non-intents from an impure function'));
        }
      } else {
        return resolve(ret.value);
      }
    };

    iterate();
  };

  const concurrentHanler = ({ intents, reality }, resolve, reject) =>
    Promise.all(intents.map(e => interpret(e, reality))).then(resolve).catch(reject);

  const interpret = (e, reality) => new Promise((resolve, reject) => {
    reality = Object.assign({
      'impure:call': (params, resolve, reject) => impureHandler(Object.assign({
        reality,
      }, params), resolve, reject),
      'impure:concurrent': (params, resolve, reject) => concurrentHanler(Object.assign({
        reality,
      }, params), resolve, reject),
    }, reality);
    const { type, values } = intents.get(e);
    const handler = reality[type];
    if (!handler) return reject(new Error(`Unhandled intent type '${type}'`));
    return handler(values, resolve, reject);
  });

  const intent = (type, values) => {
    const e =  Object.create(null);
    intents.set(e, { type, values });
    return e;
  };

  const impure = gen => (...args) => intent('impure:call', {
    args,
    gen,
  });

  const concurrent = intents => intent('impure:concurrent', {
    intents,
  });

  return {
    ensure,
    intent,
    interpret,
    impure,
    concurrent,
  };
};

module.exports =  Object.assign(create, create());

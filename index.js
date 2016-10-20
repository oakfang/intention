function nestedFreezeProxy(object) {
  return new Proxy(object, {
    get(target, key) {
      const item = target[key];
      if (typeof item === 'object') {
        return nestedFreezeProxy(item);
      }

      return item;
    },

    set() {
      return false;
    },
  });
}

function create() {
  const SCOPED_INTENT_SYM = Symbol('@@intent');
  const isIntent = it => it.hasOwnProperty(SCOPED_INTENT_SYM);
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
        if (isIntent(ret.value)) {
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

  const concurrentHandler = ({ intents, reality }, resolve, reject) =>
    Promise.all(intents.map(it => interpret(it, reality))).then(resolve).catch(reject);

  const firstOfHandler = ({ intents, reality }, resolve, reject) =>
    Promise.race(intents.map(it => interpret(it, reality))).then(resolve).catch(reject);

  const interpret = (it, reality) => new Promise((resolve, reject) => {
    reality = Object.assign({
      'impure:call': (params, resolve, reject) => impureHandler(Object.assign({
        reality,
      }, params), resolve, reject),
      'impure:concurrent': (params, resolve, reject) => concurrentHandler(Object.assign({
        reality,
      }, params), resolve, reject),
      'impure:firstOf': (params, resolve, reject) => firstOfHandler(Object.assign({
        reality,
      }, params), resolve, reject),
    }, reality);
    const { type, values } = it;
    const handler = reality[type];
    if (!handler) return reject(new Error(`Unhandled intent type '${type}'`));
    return handler(values, resolve, reject);
  })
  .then(value => value && isIntent(value) ? interpret(value, reality) : value)
  .catch(err => {
    if (err && isIntent(err)) return interpret(err, reality);
    throw err;
  });

  const intent = (type, values) => nestedFreezeProxy({
    type,
    values,
    [SCOPED_INTENT_SYM]: true,
  });

  const impure = gen => (...args) => intent('impure:call', {
    args,
    gen,
  });

  const concurrent = intents => intent('impure:concurrent', {
    intents,
  });

  const firstOf = intents => intent('impure:firstOf', {
    intents,
  });

  return {
    isIntent,
    intent,
    interpret,
    impure,
    concurrent,
    firstOf,
  };
};

module.exports =  Object.assign(create, create());

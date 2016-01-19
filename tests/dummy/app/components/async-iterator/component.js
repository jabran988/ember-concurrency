import Ember from 'ember';
import { csp, process, sleep } from 'ember-concurrency';

let AsyncIteratorObj = Ember.Object.extend({
  buffer: null,

  _assertNotYetRunning() {
    Ember.assert("You cannot call this method at this time: async iterator has already begun iterating", !this._subscription && !this.chan);
  },

  ignoreIntermediateValues() {
    this._assertNotYetRunning();
    this._drop = true;
    this.buffer = null;
    return this;
  },

  keepFirstIntermediateValue() {
    this._assertNotYetRunning();
    this.buffer = csp.buffers.dropping(1);
    return this;
  },

  keepLastIntermediateValue() {
    this._assertNotYetRunning();
    this.buffer = csp.buffers.sliding(1);
    return this;
  },

  batchValues() {
    // converts the async iterator to emit arrays of items that
    // have come in since the beginning of the current iteration.
    // the first value emitted is a single item array of the first
    // value emitted from the source.
    this._assertNotYetRunning();
    throw new Error("not yet implemented");
  },

  _ensureChannel() {
    if (this.chan) { return; }
    this.chan = csp.chan(this.buffer);
  },

  _putAsync(val) {
    if (this._drop) {
      csp.offer(this.chan, val);
    } else {
      csp.putAsync(this.chan, val);
    }
  },

  _done: false,
  next() {
    this._ensureChannel();

    if (!this._subscription) {
      this._subscription = this._observable.subscribe(v => {
        this._putAsync({ done: false, value: v });
      }, null, () => {
        this._done = true;
      });
    }

    let val = csp.poll(this.chan);
    if (val === csp.NO_VALUE) {
      if (this._done) {
        return { done: true, value: undefined };
      } else {
        return this.chan;
      }
    } else {
      return val;
    }
  },
});

function asyncIterator(obs) {
  return AsyncIteratorObj.create({
    _observable: obs,
  });
}

export default Ember.Component.extend({
  bufferType: null,

  myProcess: process(function * () {
    this.set('value', "START");
    let obs = window.Rx.Observable.interval(100).take(50 + 1).do(v => {
      if (!this.isDestroyed) {
        this.set('obsValue', v);
      }
    });

    let ai = asyncIterator(obs);
    if (this.bufferType) {
      ai[this.bufferType]();
    }

    while (true) {
      let { value, done } = yield ai.next();
      if (done) { break; }
      this.set('value', value);
      yield sleep(300); // pretend to be some async work
    }
  }).autoStart(),

  obsValue: "NONE",
  value: "INIT",
});


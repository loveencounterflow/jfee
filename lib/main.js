(function() {
  'use strict';
  var _advance, _send, defaults, freeze, isa, type_of, types, validate;

  //###########################################################################################################
  types = new (require('intertype')).Intertype();

  ({isa, type_of, validate} = types.export());

  ({freeze} = Object);

  //-----------------------------------------------------------------------------------------------------------
  defaults = {
    bare: false,
    raw: true
  };

  //-----------------------------------------------------------------------------------------------------------
  types.declare("jfee_settings", {
    tests: {
      "x is an object": function(x) {
        return this.isa.object(x);
      },
      "x.bare is a boolean": function(x) {
        return this.isa.boolean(x.bare);
      },
      "x.raw is a boolean": function(x) {
        return this.isa.boolean(x.raw);
      }
    }
  });

  //===========================================================================================================

  //-----------------------------------------------------------------------------------------------------------
  this.Receiver = class Receiver { // extends Object
    constructor(settings) {
      this.settings = freeze({...defaults, ...settings});
      validate.jfee_settings(this.settings);
      this.collector = [];
      this[Symbol.iterator] = function*() {
        yield* this.collector;
        return this.collector = [];
      };
      this._resolve = function() {};
      this.done = false;
      this.initializer = null;
      this.is_first = true;
      this.send = _send.bind(this);
      this.advance = _advance.bind(this);
      this.ratchet = new Promise((resolve) => {
        return this._resolve = resolve;
      });
      return null;
    }

    //---------------------------------------------------------------------------------------------------------
    add_data_channel(eventemitter, eventname, $key) {
      var handler, type;
      switch (type = types.type_of($key)) {
        case 'null':
        case 'undefined':
          handler = ($value) => {
            this.send($value);
            return this.advance();
          };
          break;
        case 'text':
          validate.nonempty_text($key);
          handler = ($value) => {
            this.send(freeze({$key, $value}));
            return this.advance();
          };
          break;
        case 'function':
          handler = ($value) => {
            this.send($key($value));
            return this.advance();
          };
          break;
        case 'generatorfunction':
          handler = ($value) => {
            var d, ref;
            ref = $key($value);
            for (d of ref) {
              this.send(d);
            }
            return this.advance();
          };
          break;
        default:
          throw new Error(`^receiver/add_data_channel@445^ expected a text, a function, or a generatorfunction, got a ${type}`);
      }
      eventemitter.on(eventname, handler);
      return null;
    }

    //---------------------------------------------------------------------------------------------------------
    /* TAINT make `$key` behave as in `add_data_channel()` */
    add_initializer($key) {
      /* Send a datom before any other data. */
      validate.nonempty_text($key);
      return this.initializer = freeze({$key});
    }

    //---------------------------------------------------------------------------------------------------------
    /* TAINT make `$key` behave as in `add_data_channel()` */
    add_terminator(eventemitter, eventname, $key = null) {
      /* Terminates async iterator after sending an optional datom to mark termination in stream. */
      return eventemitter.on(eventname, () => {
        if ($key != null) {
          this.send(freeze({$key}));
        }
        return this.advance(false);
      });
    }

    //---------------------------------------------------------------------------------------------------------
    static async * from_child_process(cp, settings) {
      var rcv;
      validate.childprocess(cp);
      rcv = new Receiver(settings);
      if (!rcv.settings.bare) {
        rcv.add_initializer('<cp');
      }
      rcv.add_data_channel(cp.stdout, 'data', '^stdout');
      rcv.add_data_channel(cp.stderr, 'data', '^stderr');
      rcv.add_terminator(cp, 'close', rcv.settings.bare ? null : '>cp');
      while (!rcv.done) {
        await rcv.ratchet;
        yield* rcv;
      }
      return null;
    }

    //---------------------------------------------------------------------------------------------------------
    static async * from_readstream(stream, settings) {
      var rcv;
      // validate.readstream stream
      rcv = new Receiver(settings);
      if (!rcv.settings.bare) {
        rcv.add_initializer('<stream');
      }
      rcv.add_data_channel(stream, 'data', rcv.settings.raw ? null : '^line');
      rcv.add_terminator(stream, 'close', rcv.settings.bare ? null : '>stream');
      while (!rcv.done) {
        await rcv.ratchet;
        yield* rcv;
      }
      return null;
    }

  };

  //-----------------------------------------------------------------------------------------------------------
  _send = function(d) {
    if (this.is_first) {
      this.is_first = false;
      if (this.initializer != null) {
        this.collector.push(this.initializer);
      }
    }
    return this.collector.push(d);
  };

  //-----------------------------------------------------------------------------------------------------------
  _advance = function(go_on = true) {
    this.done = !go_on;
    this._resolve();
    return this.ratchet = new Promise((resolve) => {
      return this._resolve = resolve;
    });
  };

}).call(this);

//# sourceMappingURL=main.js.map
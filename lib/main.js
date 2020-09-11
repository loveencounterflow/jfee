(function() {
  'use strict';
  var CND, FS, PATH, Receiver, _advance, _send, badge, debug, echo, freeze, help, info, isa, rpr, types, urge, validate, warn, whisper;

  //###########################################################################################################
  CND = require('cnd');

  rpr = CND.rpr;

  badge = 'JFEE';

  debug = CND.get_logger('debug', badge);

  warn = CND.get_logger('warn', badge);

  info = CND.get_logger('info', badge);

  urge = CND.get_logger('urge', badge);

  help = CND.get_logger('help', badge);

  whisper = CND.get_logger('whisper', badge);

  echo = CND.echo.bind(CND);

  //...........................................................................................................
  PATH = require('path');

  FS = require('fs');

  types = new (require('intertype')).Intertype();

  ({isa, validate} = types.export());

  ({freeze} = Object);

  /* thx to https://stackoverflow.com/a/59347615/7568091

  Seems to be working so far.

  i.e. you create a dummy promise like in Khanh's solution so that you can wait for the first result, but then
  because many results might come in all at once, you push them into an array and reset the promise to wait
  for the result (or batch of results). It doesn't matter if this promise gets overwritten dozens of times
  before its ever awaited.

  Then we can yield all the results at once with yield* and flush the array for the next batch.

  */
  //===========================================================================================================

  //-----------------------------------------------------------------------------------------------------------
  Receiver = class Receiver { // extends Object
    constructor() {
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
      /* TAINT validate settings */
      var rcv;
      rcv = new Receiver();
      rcv.add_initializer('<cp');
      rcv.add_data_channel(cp.stdout, 'data', '^stdout');
      rcv.add_data_channel(cp.stderr, 'data', '^stderr');
      rcv.add_terminator(cp, 'close', '>cp');
      while (!rcv.done) {
        await rcv.ratchet;
        yield* rcv;
      }
      return null;
    }

    //---------------------------------------------------------------------------------------------------------
    /* TAINT include option to just send buffers */
    static async * from_readstream(stream, settings) {
      /* TAINT validate settings */
      var defaults, rcv;
      defaults = {
        raw: true
      };
      settings = {...defaults, ...settings};
      rcv = new Receiver();
      rcv.add_initializer('<stream');
      rcv.add_data_channel(stream, 'data', settings.raw ? null : '^line');
      rcv.add_terminator(stream, 'close', '>stream');
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

  // #===========================================================================================================
// #
// #-----------------------------------------------------------------------------------------------------------
// create_translation_pipeline = ( file_path ) -> new Promise ( resolve_outer, reject_outer ) =>
//   validate.nonempty_text file_path
//   #---------------------------------------------------------------------------------------------------------
//   SP = require 'steampipes'
//   { $
//     $watch
//     $drain }  = SP.export()
//   #---------------------------------------------------------------------------------------------------------
//   $split_lines = ->
//     ctx   = SL.new_context()
//     last  = Symbol 'last'
//     return $ { last, }, ( d, send ) =>
//       if d is last
//         send line for line from SL.flush ctx
//         return null
//       return if not d?
//       return if not isa.buffer d
//       send line for line from SL.walk_lines ctx, d
//       return null
//   #---------------------------------------------------------------------------------------------------------
//   $skip_empty_etc = -> SP.$filter ( d ) =>
//     return false if d is ''
//     return true
//   #---------------------------------------------------------------------------------------------------------
//   $as_batches = ->
//     collector = null
//     n         = 1e4
//     last      = Symbol 'last'
//     return $ { last, }, ( d, send ) ->
//       if d is last
//         if collector?
//           send collector
//           collector = null
//         return
//       return send d unless isa.text d
//       ( collector ?= [] ).push d
//       if collector.length >= n
//         send collector
//         collector = null
//   #---------------------------------------------------------------------------------------------------------
//   $as_sql_insert = ->
//     return $ ( batch, send ) ->
//       return send batch unless isa.list batch
//       send """insert into T.pwd ( pwd ) values"""
//       last_idx  = batch.length - 1
//       for d, idx in batch
//         d_sql = d
//         ### TAINT also remove other control characters, U+fdfe etc ###
//         d_sql = d_sql.replace /\\x([0-9a-f][0-9a-f])/g, ( $0, $1 ) -> String.fromCodePoint parseInt $1, 16
//         d_sql = d_sql.replace /[\x00-\x1f�]/g, ''
//         d_sql = d_sql.replace /'/g, "''"
//         comma = if idx is last_idx then ';' else ','
//         send """( '#{d_sql}' )#{comma}"""
//   #---------------------------------------------------------------------------------------------------------
//   $echo = ->
//     return $watch ( d ) ->
//       if isa.text d
//         process.stdout.write d + '\n'
//       else
//         process.stderr.write ( CND.grey d ) + '\n'
//   #---------------------------------------------------------------------------------------------------------
//   source      = SP.new_push_source()
//   pipeline    = []
//   pipeline.push source
//   pipeline.push $split_lines()
//   pipeline.push $skip_empty_etc()
//   pipeline.push $as_batches()
//   pipeline.push $as_sql_insert()
//   pipeline.push $echo()
//   pipeline.push $drain ->
//     help "^3776^ pipeline: finished"
//     return resolve_outer()
//   SP.pull pipeline...
//   #.........................................................................................................
//   stream = FS.createReadStream file_path
//   source.send x for await x from Receiver.from_readstream stream
//   source.end()
//   return null

}).call(this);

//# sourceMappingURL=main.js.map
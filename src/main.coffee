
'use strict'


############################################################################################################
types                     = new ( require 'intertype' ).Intertype()
{ isa
  type_of
  validate }              = types.export()
{ freeze, }               = Object

#-----------------------------------------------------------------------------------------------------------
defaults =
  bare: false
  raw:  true

#-----------------------------------------------------------------------------------------------------------
types.declare "jfee_settings", tests:
  "x is an object":           ( x ) -> @isa.object x
  "x.bare is a boolean":      ( x ) -> @isa.boolean x.bare
  "x.raw is a boolean":       ( x ) -> @isa.boolean x.raw


#===========================================================================================================
#
#-----------------------------------------------------------------------------------------------------------
class @Receiver # extends Object
  constructor: ( settings ) ->
    @settings             = freeze { defaults..., settings..., }
    validate.jfee_settings @settings
    @collector            = []
    @[ Symbol.iterator ]  = -> yield from @collector; @collector = []
    @_resolve             = ->
    @done                 = false
    @initializer          = null
    @is_first             = true
    @send                 = _send.bind @
    @advance              = _advance.bind @
    @ratchet              = new Promise ( resolve ) => @_resolve = resolve
    return null

  #---------------------------------------------------------------------------------------------------------
  add_data_channel: ( eventemitter, eventname, $key ) ->
    switch type = types.type_of $key
      when 'null', 'undefined'
        handler = ( $value ) =>
          @send $value
          @advance()
      when 'text'
        validate.nonempty_text $key
        handler = ( $value ) =>
          @send freeze { $key, $value, }
          @advance()
      when 'function'
        handler = ( $value ) =>
          @send $key $value
          @advance()
      when 'generatorfunction'
        handler = ( $value ) =>
          @send d for d from $key $value
          @advance()
      else
        throw new Error "^receiver/add_data_channel@445^ expected a text, a function, or a generatorfunction, got a #{type}"
    eventemitter.on eventname, handler
    return null

  #---------------------------------------------------------------------------------------------------------
  ### TAINT make `$key` behave as in `add_data_channel()` ###
  add_initializer: ( $key ) ->
    ### Send a datom before any other data. ###
    validate.nonempty_text $key
    @initializer = freeze { $key, }

  #---------------------------------------------------------------------------------------------------------
  ### TAINT make `$key` behave as in `add_data_channel()` ###
  add_terminator: ( eventemitter, eventname, $key = null ) ->
    ### Terminates async iterator after sending an optional datom to mark termination in stream. ###
    eventemitter.on eventname, =>
      @send freeze { $key, } if $key?
      @advance false

  #---------------------------------------------------------------------------------------------------------
  @from_child_process: ( cp, settings ) ->
    validate.childprocess cp
    rcv = new Receiver settings
    rcv.add_initializer   '<cp' unless rcv.settings.bare
    rcv.add_data_channel  cp.stdout, 'data', '^stdout'
    rcv.add_data_channel  cp.stderr, 'data', '^stderr'
    rcv.add_terminator    cp, 'close', if rcv.settings.bare then null else '>cp'
    while not rcv.done
      await rcv.ratchet; yield from rcv
    return null

  #---------------------------------------------------------------------------------------------------------
  @from_readstream: ( stream, settings ) ->
    # validate.readstream stream
    rcv = new Receiver settings
    rcv.add_initializer  '<stream' unless rcv.settings.bare
    rcv.add_data_channel  stream, 'data',   if rcv.settings.raw  then null else '^line'
    rcv.add_terminator    stream, 'close',  if rcv.settings.bare then null else '>stream'
    while not rcv.done
      await rcv.ratchet; yield from rcv
    return null

#-----------------------------------------------------------------------------------------------------------
_send = ( d ) ->
  if @is_first
    @is_first = false
    @collector.push @initializer if @initializer?
  @collector.push d

#-----------------------------------------------------------------------------------------------------------
_advance  = ( go_on = true ) ->
  @done     = not go_on
  @_resolve()
  @ratchet  = new Promise ( resolve ) => @_resolve = resolve


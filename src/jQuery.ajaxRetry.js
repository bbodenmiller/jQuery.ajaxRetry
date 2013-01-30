(function( $, undefined ) {
    "use strict";
    
    var retryKey = "__RETRY__";

    $.ajaxPrefilter(function( options, originalOptions, jqXHR ) {
        // Don't handle a call that's already "fixed".
        if ( options[retryKey] ) {
            return;
        }
        
        // Mark this as having been processed so the prefilter doesn't touch subsequent retried requests
        originalOptions[ retryKey ] = true;
        
        // We haven't retried anything yet, so start us out at 0;
        originalOptions.retryCount = 0;

        var dfr = $.Deferred(),
            completeDeferred = $.Deferred(),
            statusCode = originalOptions.statusCode,
            shouldRetry = function( jqXHR, retryCount ) {
                var result,
                    test = originalOptions.shouldRetry,
                    type = typeof test;
                    
                switch( type ) {
                    case "number":
                        result = retryCount < test;
                        break;
                    case "boolean":
                        result = test;
                        break;
                    case "function":
                        result = test( jqXHR, retryCount );
                        break;
                }

                return $.when( result );
            };
        
        dfr.then( options.success, options.error );
        completeDeferred.done( options.complete );

        // Completely obliterate the original request state handlers since we want to handle them manually.
        options.success = options.error = options.complete = originalOptions.success =
            originalOptions.error = originalOptions.complete = options.statusCode = originalOptions.statusCode = undefined;

        function retryRequest( options, lastJqXHR ) {
            var willRetryDeferred = $.Deferred();
            
            shouldRetry( lastJqXHR, options.retryCount++ ).done(function( willRetry ) {
                if ( willRetry === true ) {
                    $.ajax( options ).then(
                        function( data, textStatus, jqXHR ) {
                            dfr.resolveWith( this, arguments );
                            jqXHR.statusCode( statusCode );
                            completeDeferred.resolveWith( this, [ jqXHR, textStatus ]);
                        },
                        function( jqXHR, textStatus ) {
                            var failureArgs = arguments,
                                failureContext = this;
                            
                            retryRequest( options, jqXHR ).done(function( willRetry ) {
                                if ( !willRetry ) {
                                    dfr.rejectWith( failureContext, failureArgs );
                                    jqXHR.statusCode( statusCode );
                                    completeDeferred.resolveWith( failureContext, [ jqXHR, textStatus ]);
                                }
                            });
                        }
                    );
                }
                
                willRetryDeferred.resolve( willRetry );
            });
 
            return willRetryDeferred.promise();
        }
        
        jqXHR.then(
            function( data, textStatus, jqXHR ) {
                dfr.resolveWith( this, arguments );
                completeDeferred.resolveWith( this, [ jqXHR, textStatus ]);
            },
            function( jqXHR, textStatus ) {
                var failureContext = this,
                    failureArgs = arguments;
                    
                retryRequest( originalOptions, jqXHR ).done(function( willRetry ) {
                    if ( willRetry !== true ) {
                        dfr.rejectWith( failureContext, failureArgs );
                        completeDeferred.resolveWith( failureContext, [ jqXHR, textStatus ]);
                    }
                });
            }
        );
        
        // Install legacy deferred style functions.  These are deprecated,
        // and presumably will be removed as a group at some point.
        // To maintain API compatibility, first check if we should even install these.
        if ( jqXHR.complete ) {
            jqXHR.complete = completeDeferred.done;
            jqXHR.success = dfr.done;
            jqXHR.error = dfr.fail;
        }
        
        // Override the promise methods on the jqXHR.  Don't use the .promise(obj) syntax
        // here since that wasn't introduced until 1.6. By using $.extend,
        // we can support 1.5 as well - nothing else needs to change.
        $.extend( jqXHR, dfr.promise() );
    });
}( jQuery ));
/*
 * Copyright 2015 Hewlett-Packard Development Company, L.P.
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License.
 */
(function() {
    var XHR_DONE_STATE = 4;
    var DEFAULT_HOD_DOMAIN = 'havenondemand.com';

    /**
     * This script assumes that if the page has this query parameter, the user has already been to the SSO page.
     * @type {string}
     */
    var AUTHENTICATED_PARAMETER = 'authenticated';

    /**
     * Used for query parameter values.
     * @type {string}
     */
    var TRUE_STRING = 'true';

    /**
     * The error code returned by HOD when there is no SSO cookie.
     * @type {number}
     */
    var NO_USER_TOKEN_CODE = 12102;

    /**
     * Possible values of the type property for {@link SsoError}s called back from functions exposed by this script.
     * @enum {string}
     * @readonly
     */
    var ERROR_TYPES = {
        /**
         * Indicates that a non-200 response was received from the application backend. The status code and any response
         * object will be included in the called back error.
         */
        APPLICATION: 'APPLICATION',

        /**
         * Indicates that a non-200 response was received from HOD. The status code and any response object will be included
         * in the called back error.
         */
        HOD: 'HOD',

        /**
         * The SSO page called back an error to the redirect URL. The error string will be included in the called back error.
         */
        SSO : 'SSO',

        /**
         * The user has successfully visiting the SSO page but HOD still thinks they have no token.
         */
        NO_USER_TOKEN: 'NO_USER_TOKEN',

        /**
         * During authentication there were no user/application pairs to use to create a combined token.
         */
        NO_USERS_AUTHORISED: 'NO_USERS_AUTHORISED'
    };

    /**
     * Parse a location search string (eg "?foo=1&bar=cat&bar=dog") into an object of string keys to a string value. The
     * first value for a given key is used.
     * @param {string} search
     * @return {Object<string, string>}
     */
    function parseQueryString(search) {
        if (search === '') {
            return {};
        } else {
            return search
            // Remove the leading question mark
                .substring(1)
                .split('&')
                .map(function(pairString) {
                    return pairString.split('=').map(decodeURIComponent);
                })
                .reduce(function(output, pair) {
                    var key = pair[0];

                    if (!output[key]) {
                        output[key] = pair[1];
                    }

                    return output;
                }, {});
        }
    }

    /**
     * Build a URL encoded query string from a map of key to values.
     * @param {Object.<string, string[]>} parameters
     * @return {string}
     */
    function buildQueryString(parameters) {
        return Object.keys(parameters)
            .reduce(function(pairStrings, key) {
                var encodedKey = encodeURIComponent(key);

                var pairsForKey = parameters[key].map(function(value) {
                    return [encodedKey, encodeURIComponent(value)].join('=');
                });

                return pairStrings.concat(pairsForKey);
            }, [])
            .join('&');
    }

    /**
     * Add a ready state change listener to an XMLHttpRequest. When the request is done, the callback is called. Assumes
     * a JSON response.
     * @param {XMLHttpRequest} xhr
     * @param {string} errorType The type of error to return if a non-200 response is received {@link ERROR_TYPES}
     * @param {Function} callback Called with an error response and status if there is one or null and the parsed response
     */
    function addReadyStateChangeListener(xhr, errorType, callback) {
        xhr.addEventListener('readystatechange', function() {
            if (xhr.readyState === XHR_DONE_STATE) {
                var response;

                try {
                    response = JSON.parse(xhr.response);
                } catch (e) {
                    response = null;
                }

                if (xhr.status === 200) {
                    callback(null, response);
                } else {
                    callback({
                        type: errorType,
                        status: xhr.status,
                        response: response
                    });
                }
            }
        });
    }

    /**
     * Make a signed request to HOD, calling the callback when it is done.
     * @param {SignedRequest} request
     * @param {string} userToken May be null
     * @param {Function} callback
     */
    function makeSignedRequest(request, userToken, callback) {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.open(request.verb, request.url);
        xhr.setRequestHeader('token', request.token);

        if (userToken !== null) {
            xhr.setRequestHeader('cmb_sso_tkn', userToken);
        }

        if (request.body) {
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        }

        addReadyStateChangeListener(xhr, ERROR_TYPES.HOD, callback);

        if (request.body) {
            xhr.send(request.body);
        } else {
            xhr.send();
        }
    }

    /**
     * Get a request to HOD signed by the application backend.
     * @param url
     * @param callback Called with an error if there was one or null and a {@link SignedRequest}.
     */
    function getSignedRequest(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        addReadyStateChangeListener(xhr, ERROR_TYPES.APPLICATION, callback);
        xhr.send();
    }

    /**
     * Represents a request to make to HOD from the browser. Should be generated on the server using the application
     * unbound token.
     * @typedef {Object} SignedRequest
     * @property {string} url Full URL for the request, including protocol, host, path and query string
     * @property {string} verb HTTP method
     * @property {string} token HMAC signing of the request
     * @property {string} body Request body if there is one, null if not
     */
    /**
     * @typedef {Object} SsoError
     * @property {string} type One of {@link ERROR_TYPES}
     * @property {number} [status] Status code of the HTTP request which failed, if there was one
     * @property {Object} [response] Response of the HTTP request which failed, if there was one
     * @property {string} [errorParameter] Value of the error parameter called back from the SSO page, if there was one
     */

    /**
     * @typedef {Object} AuthenticateCombinedOutput
     * @property {string} domain The application domain
     * @property {string} application The application name
     * @property {string} username
     * @property {Object} combinedToken
     */
    /**
     * If listApplicationRequest is provided, the listApplicationRequestApi endpoint will not be called.
     * @typedef {Object} AuthenticateOptions
     * @property {string} applicationRoot Root path of application
     * @property {string} [hodDomain] HOD Domain, defaults to havenondemand.com
     * @property {string} [ssoPage] URL of HOD SSO page, defaults to https://dev.havenondemand.com/sso.html. In case that provided, overrides the hodDomain value for the SSO page redirection.
     * @property {string} [combinedPatchRequestApi=/api/combined-patch-request] The URI to obtain the signature of a combined PATCH request to make from the SSO page
     * @property {SignedRequest} [listApplicationRequest] A signed request to get a list of applications
     * @property {string} [listApplicationRequestApi=/api/list-application-request] The URI to obtain the signed list application request from
     * @property {string} [combinedRequestApi=/api/combined-request] The URI to obtain the signed authentication request from
     */
    /**
     * @callback AuthenticateCallback
     * @param {SsoError|null} error
     * @param {AuthenticateCombinedOutput} [output]
     */
    /**
     * Attempt to authenticate the user using SSO. If the user is not signed in, redirects the browser to the SSO page.
     * If the authentication fails, the callback is called with an error. If not, it is called with null and a combined
     * token.
     * @param {AuthenticateCallback} callback
     * @param {AuthenticateOptions} options Configuration options
     */
    function authenticate(callback, options) {
        var applicationRoot = options.applicationRoot;
        var hodDomain = options.hodDomain || DEFAULT_HOD_DOMAIN;
        var ssoPage = options.ssoPage || 'https://dev.' + hodDomain + '/sso.html';
        var combinedRequestApi = options.combinedRequestApi || '/api/combined-request';
        var listApplicationRequestApi = options.listApplicationRequestApi || '/api/list-application-request';
        var combinedPatchRequestApi = options.combinedPatchRequestApi || '/api/combined-patch-request';

        function authenticateWithListRequest(listApplicationRequest) {
            var queryParameters = parseQueryString(location.search);

            // Check if there is a user token in the query parameters; if there is, use it for all requests to HOD
            var userToken;

            if (queryParameters.type && queryParameters.id && queryParameters.secret) {
                userToken = [queryParameters.type, queryParameters.id, queryParameters.secret].join(':');
            } else {
                userToken = null;
            }

            function handleHodErrorResponse(httpError, callback) {
                var response = httpError.response;

                if (queryParameters.error) {
                    // The SSO page called back an error in the query parameters
                    callback({type: ERROR_TYPES.SSO, errorParameter: queryParameters.error});
                } else if (response && response.error === NO_USER_TOKEN_CODE) {
                    if (queryParameters[AUTHENTICATED_PARAMETER] === TRUE_STRING) {
                        // The user has successfully been to the SSO page but HOD can't find their unbound token
                        callback({type: ERROR_TYPES.NO_USER_TOKEN});
                    } else {
                        var redirectUrl = location.protocol + '//' + location.host + location.pathname;

                        // Fetch the signature of a combined PATCH request to forward to the SSO page
                        getSignedRequest(applicationRoot + combinedPatchRequestApi + '?' + buildQueryString({'redirect-url': [redirectUrl]}), function(httpError, request) {
                            if (httpError) {
                                callback(httpError);
                            } else {
                                // The user has no unbound token and we haven't sent them to the SSO page before, so send them there now
                                window.location.assign(ssoPage + '?' + buildQueryString({
                                    app_token: [request.token],
                                    redirect_url: [redirectUrl]
                                }));
                            }
                        });
                    }
                } else {
                    callback(httpError);
                }
            }

            // Get a list of applications and users which match the authentication
            makeSignedRequest(listApplicationRequest, userToken, function(httpError, response) {
                if (httpError) {
                    handleHodErrorResponse(httpError, callback);
                } else if (!response.length || !response[0].users.length) {
                    // There are no user/application pairs to create a combined token from
                    callback({type: ERROR_TYPES.NO_USERS_AUTHORISED});
                } else {
                    // TODO: Allow user to choose application and user store names and domains
                    var application = {
                        description: response[0].description,
                        domain: response[0].domain,
                        domainDescription: response[0].domainDescription,
                        name: response[0].name
                    };

                    var userStore = {
                        domain: response[0].users[0].domain,
                        name: response[0].users[0].userStore,
                        domainDescription: response[0].users[0].domainDescription
                    };

                    var accounts = response[0].users[0].accounts;

                    var combinedTokenParameters = buildQueryString({
                        domain: [application.domain],
                        application: [application.name],
                        'user-store-domain': [userStore.domain],
                        'user-store-name': [userStore.name]
                    });

                    // Sign the authenticate combined request via the backend
                    getSignedRequest(applicationRoot + combinedRequestApi + '?' + combinedTokenParameters, function(httpError, combinedRequest) {
                        if (httpError) {
                            callback(httpError);
                        } else {
                            // Make the signed request to obtain a combined token
                            makeSignedRequest(combinedRequest, userToken, function(httpError, response) {
                                if (httpError) {
                                    handleHodErrorResponse(httpError, callback);
                                } else {
                                    var combinedToken = response.token;

                                    callback(null, {
                                        accounts: accounts,
                                        application: application,
                                        userStore: userStore,
                                        combinedToken: combinedToken
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        if (options.listApplicationRequest) {
            authenticateWithListRequest(options.listApplicationRequest);
        } else {
            // If a signed list application request was not provided, fetch it from the backend first
            getSignedRequest(applicationRoot + listApplicationRequestApi, function(error, listApplicationRequest) {
                if (error) {
                    callback(error);
                } else {
                    authenticateWithListRequest(listApplicationRequest);
                }
            });
        }
    }

    /**
     * @typedef {Object} LogoutOptions
     * @property {string} combinedToken The combined token string to use to log out
     * @property {string} [hodDomain=havenondemand.com] Domain for Haven OnDemand endpoint
     * @property {string} [hodEndpoint=https://api.havenondemand.com] Haven OnDemand endpoint, overrides the hodDomain
     * if supplied
     * @property {string} [logoutUrl=https://api.havenondemand.com/2/authenticate/combined] URL for the logout request,
     * overrides the hodEndpoint if supplied
     */
    /**
     * @callback LogoutCallback
     * @param {SsoError|null} error An error object of type {@link ERROR_TYPES.HOD}
     * @param {Object} [response] Response received from Haven OnDemand
     */
    /**
     * Attempt to log the user out using SSO, calling the callback when the process completes.
     * @param {LogoutCallback} callback
     * @param {LogoutOptions} options
     */
    function logout(callback, options) {
        var hodDomain = options.hodDomain || DEFAULT_HOD_DOMAIN;
        var hodEndpoint = options.hodEndpoint || 'https://api.' + hodDomain;
        var logoutUrl = options.logoutUrl || hodEndpoint + '/2/authenticate/combined';

        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.open('DELETE', logoutUrl);
        xhr.setRequestHeader('token', options.combinedToken);
        addReadyStateChangeListener(xhr, ERROR_TYPES.HOD, callback);
        xhr.send();
    }

    window.havenOnDemandSso = window.havenOnDemandSso || {};
    window.havenOnDemandSso.ERROR_TYPES = ERROR_TYPES;
    window.havenOnDemandSso.authenticate = authenticate;
    window.havenOnDemandSso.logout = logout;
})();

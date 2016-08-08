/*
 * Copyright 2015 Hewlett-Packard Development Company, L.P.
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License.
 */
(function() {
    var XHR_DONE_STATE = 4;
    var DEFAULT_HOD_DOMAIN = 'havenondemand.com';

    /**
     * This script assumes that if the page has this query parameter, the user has already been to the SSO page.
     * @type {String}
     */
    var AUTHENTICATED_PARAMETER = 'authenticated';

    /**
     * Used for query parameter values.
     * @type {String}
     */
    var TRUE_STRING = 'true';

    /**
     * The error code returned by HOD when there is no SSO cookie.
     * @type {number}
     */
    var NO_USER_TOKEN_CODE = 12102;

    /**
     * Possible values of the type property for {@link SsoError}s called back from functions exposed by this script.
     * @enum {String}
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
         * A function in this script suspects that cross-domain cookies are disabled in the user's browser.
         */
        CROSS_DOMAIN_COOKIES: 'CROSS_DOMAIN_COOKIES',

        /**
         * During authentication there were no user/application pairs to use to create a combined token.
         */
        NO_USERS_AUTHORISED: 'NO_USERS_AUTHORISED'
    };

    /**
     * Parse a location search string (eg "?foo=1&bar=cat&bar=dog") into an object of string keys to an array of values.
     * @param {String} search
     * @return {Object<String, String[]>}
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
                    output[key] = (output[key] || []).concat(pair[1]);
                    return output;
                }, {});
        }
    }

    /**
     * Build a URL encoded query string from a map of key to values.
     * @param {Object.<String, String[]>} parameters
     * @return {String}
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
     * @param {String} errorType The type of error to return if a non-200 response is received {@link ERROR_TYPES}
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
     * @param {Function} callback
     */
    function makeSignedRequest(request, callback) {
        var xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.open(request.verb, request.url);
        xhr.setRequestHeader('token', request.token);

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
     * @property {String} type One of {@link ERROR_TYPES}
     * @property {Number} [status] Status code of the HTTP request which failed, if there was one
     * @property {Object} [response] Response of the HTTP request which failed, if there was one
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
     * @property {SignedRequest} [listApplicationRequest] A signed request to get a list of applications
     * @property {string} [combinedRequestApi=/api/combined-request] The URI to obtain the signed authentication request from
     * @property {string} [listApplicationRequestApi=/api/list-application-request] The URI to obtain the signed list application request from
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
        options = options || {};
        var applicationRoot = options.applicationRoot;
        var hodDomain = options.hodDomain || DEFAULT_HOD_DOMAIN;
        var ssoPage = options.ssoPage || 'https://dev.' + hodDomain + '/sso.html';
        var combinedRequestApi = options.combinedRequestApi || '/api/combined-request';
        var listApplicationRequestApi = options.listApplicationRequestApi || '/api/list-application-request';

        function handleHodErrorResponse(httpError, callback) {
            var response = httpError.response;

            if (response && response.error === NO_USER_TOKEN_CODE) {
                var authenticatedParameterValues = parseQueryString(location.search)[AUTHENTICATED_PARAMETER];

                if (authenticatedParameterValues && authenticatedParameterValues.indexOf(TRUE_STRING) !== -1) {
                    // The user has been to dev console but we still don't have a valid unbound token. This is probably
                    // because the browser doesn't allow cross-domain cookies.
                    callback({type: ERROR_TYPES.CROSS_DOMAIN_COOKIES});
                } else {
                    // Include the current location query parameters in the dev console redirect URL
                    var redirectQueryParameters = parseQueryString(location.search);

                    // Add a query parameter to the redirect URL to indicate that the user has been to dev console
                    redirectQueryParameters[AUTHENTICATED_PARAMETER] = [TRUE_STRING];

                    var redirectUrl = location.protocol + '//' + location.host + location.pathname + '?' + buildQueryString(redirectQueryParameters);

                    // The user's unbound token is invalid and we haven't sent them to dev console before, so send them there now
                    window.location = ssoPage + '?' + buildQueryString({redirect_url: [redirectUrl]});
                }
            } else {
                callback(httpError);
            }
        }

        function authenticateWithListRequest(listApplicationRequest) {
            // Get a list of applications and users which match the authentication
            makeSignedRequest(listApplicationRequest, function(error, response) {
                if (error) {
                    handleHodErrorResponse(error, callback);
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

                    getSignedRequest(applicationRoot + combinedRequestApi + '?' + combinedTokenParameters, function(error, combinedRequest) {
                        if (error) {
                            callback(error);
                        } else {
                            // Obtain a combined token
                            makeSignedRequest(combinedRequest, function(error, response) {
                                if (error) {
                                    handleHodErrorResponse(error, callback);
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
     * @property {String} combinedToken The combined token string to use to log out
     * @property {String} [hodDomain=havenondemand.com] Domain for Haven OnDemand endpoint
     * @property {String} [hodEndpoint=https://api.havenondemand.com] Haven OnDemand endpoint, overrides the hodDomain
     * if supplied
     * @property {String} [logoutUrl=https://api.havenondemand.com/2/authenticate/combined] URL for the logout request,
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

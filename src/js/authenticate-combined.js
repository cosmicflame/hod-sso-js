(function() {
    /*jshint camelcase: false */

    var XHR_DONE_STATE = 4;

    /**
     * The error code returned by HOD when there is no SSO cookie.
     * @type {number}
     */
    var NO_USER_TOKEN_CODE = 12102;

    /**
     * Build a URL encoded query string from a map of key to value.
     * @param {Object.<string, string>} parameters
     * @return {string}
     */
    function buildQueryString(parameters) {
        return Object.keys(parameters).map(function(name) {
            return encodeURIComponent(name) + '=' + encodeURIComponent(parameters[name]);
        }).join('&');
    }

    /**
     * Add a ready state change listener to an XMLHttpRequest. When the request is done, the callback is called. Assumes
     * a JSON response.
     * @param {XMLHttpRequest} xhr
     * @param {Function} callback Called with an error response and status if there is one or null and the parsed response
     */
    function addReadyStateChangeListener(xhr, callback) {
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
                    callback(xhr.status, response);
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

        addReadyStateChangeListener(xhr, callback);

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
        addReadyStateChangeListener(xhr, callback);
        xhr.send();
    }

    /**
     * @typedef {Object} AuthenticateCombinedOutput
     * @property {string} domain The application domain
     * @property {string} application The application name
     * @property {string} username
     * @property {Object} combinedToken
     */
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
     * @typedef {Object} AuthenticateCombinedOptions
     * @property {string} applicationRoot Root path of application
     * @property {string} [hodDomain] HOD Domain, defaults to idolondemand.com
     * @property {string} [ssoPage] URL of HOD SSO page, defaults to https://idolondemand.com/sso.html. In case that provided, overrides the hodDomain value for the SSO page redirection.
     * @property {SignedRequest} [listApplicationRequest] A signed request to get a list of applications
     */
    /**
     * Attempt to authenticate the user using SSO. If the user is not signed in, redirects the browser to the SSO page.
     * If the authentication fails, the callback is called with an error. If not, it is called with null and a combined
     * token.
     * @param {Function} callback Called with an error if there was one, or with null and a {@link AuthenticateCombinedOutput}.
     * @param {AuthenticateCombinedOptions} options Configuration options
     */
    function authenticateCombined(callback, options) {
        options = options || {};
        var applicationRoot = options.applicationRoot;
        var hodDomain = options.hodDomain || 'idolondemand.com';
        var ssoPage = options.ssoPage || ['https://', hodDomain, '/sso.html'].join('');

        function handleHodErrorResponse(error, response, callback) {
            if (response && response.error === NO_USER_TOKEN_CODE) {
                // The user SSO token is (probably) invalid so redirect to SSO
                window.location = ssoPage + '?' + buildQueryString({redirect_url: window.location});
            } else {
                callback(error);
            }
        }

        function authenticate(listApplicationRequest) {
            // Get a list of applications and users which match the authentication
            makeSignedRequest(listApplicationRequest, function(error, response) {
                if (error) {
                    handleHodErrorResponse(error, response, callback);
                } else {
                    // TODO: Allow user to choose application and user store names and domains
                    var domain = response[0].domain;
                    var application = response[0].name;
                    var username = response[0].users[0].name;

                    var combinedTokenParameters = {
                        domain: domain,
                        application: application,
                        'user-store-domain': response[0].users[0].domain,
                        'user-store-name': response[0].users[0].userStore
                    };

                    getSignedRequest(applicationRoot + '/api/combined-request?' + buildQueryString(combinedTokenParameters), function(error, combinedRequest) {
                        if (error) {
                            callback(error);
                        } else {
                            // Obtain a combined token
                            makeSignedRequest(combinedRequest, function(error, response) {
                                if (error) {
                                    handleHodErrorResponse(error, response, callback);
                                } else {
                                    var combinedToken = response.token;

                                    callback(null, {
                                        application: application,
                                        domain: domain,
                                        username: username,
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
            authenticate(options.listApplicationRequest);
        } else {
            getSignedRequest(applicationRoot + '/api/list-application-request', function(error, listApplicationRequest) {
                if (error) {
                    callback(error);
                } else {
                    authenticate(listApplicationRequest);
                }
            });
        }
    }

    window.havenOnDemandSso = window.havenOnDemandSso || {};
    window.havenOnDemandSso.authenticate = authenticateCombined;
})();

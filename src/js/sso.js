/*
 * Copyright 2015 Hewlett-Packard Development Company, L.P.
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License.
 */
/**
 * @typedef {Object} SsoConfig
 * @property {string} ssoEntryPage The page which is using this script
 * @property {string} errorPage The error page to redirect to if there is an error. This page will be passed a
 * statusCode query parameter
 * @property {string} authenticatePath The URI to post the combined token to once authentication is complete
 * @property {string} [ssoPage] The URL of the HP Haven OnDemand SSO page
 * @property {string} combinedRequestApi The URI to obtain the signed authentication request from
 * @property {string} combinedPatchRequestApi The URI to obtain the signed combined PATCH request from
 * @property {SignedRequest} listApplicationRequest The request to be made to list the available applications
 */
/**
 * Script for obtaining a combined token from HP Haven OnDemand and sending it to your server. This script will read the
 * contents of the element with id 'config-json' and use it as its configuration. A script tag with type 'application/json'
 * is best used for this purpose.
 *
 * This script assumes that the application serving it has the same domain as the combinedRequestApi, so applicationRoot
 * is built by subtracting ssoEntryPage from the current URL.
 *
 * Once authentication has occurred the components of the token received from HP Haven OnDemand will be appended to the
 * form with id 'authenticate-form', and this form will be submitted, allowing your application to use the combined token.
 * This form must exist on the document and should already contain any other inputs you need to submit to your server.
 *
 * The configuration should of type SsoConfig.
 */
(function() {
    var CONFIG = JSON.parse(document.getElementById('config-json').textContent);

    var applicationRoot = location.pathname.substring(0, location.pathname.lastIndexOf(CONFIG.ssoEntryPage));

    window.addEventListener('load', function() {
        var form = document.getElementById('authenticate-form');

        window.havenOnDemandSso.authenticate(function(error, output) {
            if (error) {
                var statusCode;

                if (error.type === window.havenOnDemandSso.ERROR_TYPES.NO_USER_TOKEN) {
                    statusCode = 500;
                } else if (error.type === window.havenOnDemandSso.ERROR_TYPES.NO_USERS_AUTHORISED) {
                    statusCode = 403;
                } else if (error.type === window.havenOnDemandSso.ERROR_TYPES.SSO) {
                    statusCode = 401;
                } else {
                    statusCode = error.status || 500;
                }

                window.location.assign(applicationRoot + CONFIG.errorPage + '?statusCode=' + statusCode);
            } else {
                var combinedToken = output.combinedToken;
                var inputsFragment = document.createDocumentFragment();

                Object.keys(combinedToken).forEach(function(name) {
                    var input = document.createElement('input');
                    input.setAttribute('name', name);
                    input.setAttribute('value', combinedToken[name]);
                    input.setAttribute('type', 'hidden');
                    inputsFragment.appendChild(input);
                });

                form.appendChild(inputsFragment);
                form.submit();
            }
        }, {
            listApplicationRequest: CONFIG.listApplicationRequest,
            applicationRoot: applicationRoot,
            ssoPage: CONFIG.ssoPage,
            combinedPatchRequestApi: CONFIG.combinedPatchRequestApi,
            combinedRequestApi: CONFIG.combinedRequestApi
        });

        form.setAttribute('action', applicationRoot + CONFIG.authenticatePath);
    });
})();

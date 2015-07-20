(function() {
    var CONFIG = JSON.parse(document.getElementById('config-json').textContent);
    var searchoptimizerRoot = location.pathname.substring(0, location.pathname.lastIndexOf(CONFIG.ssoEntryPage));

    window.addEventListener('load', function() {
        var form = document.getElementById('authenticate-form');

        window.haven_search.authenticate(function(errorStatus, output) {
            if (errorStatus) {
                location = searchoptimizerRoot + CONFIG.errorPage + '?statusCode=' + errorStatus;
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
            searchoptimizerRoot: searchoptimizerRoot,
            ssoPage: CONFIG.ssoPage
        });

        form.setAttribute("action", searchoptimizerRoot + CONFIG.authenticatePath);
    });
})();

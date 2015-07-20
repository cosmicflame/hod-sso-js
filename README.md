# HP Haven OnDemand SSO Javascript
Javascript library for working with HP Haven OnDemand SSO

## Usage
The library can be installed using bower:

    bower install hp-autonomy-hod-sso-js

The library consists of two files. 

* src/js/authenticate-combined exposes a function named authenticate on the global
havenOnDemandSso. This function makes a signed request to HP Haven OnDemand to retrieve a combined token. Consult the
JSDoc in the file for more information
* src/js/sso posts the token returned from havenOnDemandSso.authenticate to your server by generating and submitting a
form

You may prefer to use your own equivalent of sso.js depending on your application

# Is it any good?
Yes

## License
Copyright 2015 Hewlett-Packard Development Company, L.P.

Licensed under the MIT License (the "License"); you may not use this project except in compliance with the License.

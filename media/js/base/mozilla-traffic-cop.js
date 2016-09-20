/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// create namespace
if (typeof Mozilla === 'undefined') {
    var Mozilla = {};
}

/**
 * Traffic Cop traffic redirector for A/B/x testing
 *
 * Example usage:
 *
 * var cop = new Mozilla.TrafficCop({
 *     id: 'exp_firefox_new_all_link',
 *     variations: {
 *         'v=1': 25,
 *         'v=2': 25,
 *         'v=3': 25
 *     }
 * });
 *
 * cop.init();
 *
 *
 * @param Object config: Object literal containing the following:
 *      String id (required): Unique-ish string for cookie identification.
 *          Only needs to be unique to other currently running tests.
 *      Object variations (required): Object holding key/value pairs of
 *          variations and their respective traffic percentages. Example:
 *
 *          variations: {
 *              'v=1': 20,
 *              'v=2': 20,
 *              'v=3': 20
 *          }
 */
Mozilla.TrafficCop = function(config) {
    'use strict';

    // make sure config is an object
    config = (typeof config === 'object') ? config : {};

    // store id
    this.id = config.id;

    // store variations
    this.variations = config.variations;

    // store total percentage of users targeted
    this.totalPercentage = 0;

    this.redirectVariation;

    // calculate and store total percentage of variations
    for (var v in this.variations) {
        if (this.variations.hasOwnProperty(v) && typeof this.variations[v] === 'number') {
            this.totalPercentage += this.variations[v];
        }
    }

    return this;
};

Mozilla.TrafficCop.noVariationCookieValue = 'novariation';

/*
 * Initialize the traffic cop. Validates variations, ensures user is not
 * currently viewing a variation, and (possibly) redirects to a variation
 */
Mozilla.TrafficCop.prototype.init = function() {
    var redirectUrl;

    // respect the DNT
    if (typeof window._dntEnabled === 'function' && window._dntEnabled()) {
        return;
    }

    // make sure config is valid (id & variations present)
    if (this.verifyConfig()) {
        // make sure current page doesn't match a variation
        // (to avoid infinite redirects)
        if (!this.isVariation()) {
            // roll the dice to see if user should be send to a variation
            redirectUrl = this.generateRedirectUrl();

            if (redirectUrl) {
                // if we get a variation, send the user and store a cookie
                if (redirectUrl !== Mozilla.TrafficCop.noVariationCookieValue) {
                    Mozilla.Cookies.setItem(this.id, this.redirectVariation);
                    window.location.href = redirectUrl;
                }
            } else {
                // if no variation, set a cookie so user isn't re-entered into
                // the dice roll on next page load
                Mozilla.Cookies.setItem(this.id, Mozilla.TrafficCop.noVariationCookieValue);
            }
        }
    }
};

/*
 * Ensures variations were provided and in total capture between 1 and 99%
 * of users.
 */
Mozilla.TrafficCop.prototype.verifyConfig = function() {
    if (!this.id || typeof this.id !== 'string') {
        return false;
    }

    // make sure totalPercent is between 0 and 100
    if (this.totalPercentage === 0 || this.totalPercentage > 100) {
        return false;
    }

    return true;
};

/*
 * Checks to see if user is currently viewing a variation.
 */
Mozilla.TrafficCop.prototype.isVariation = function(queryString) {
    var isVariation = false;
    queryString = queryString || window.location.search;

    // check queryString for presence of variation
    for (var v in this.variations) {
        if (queryString.indexOf('?' + v) > -1 || queryString.indexOf('&' + v) > -1) {
            isVariation = true;
            break;
        }
    }

    return isVariation;
};

/*
 * Generates a random percentage (between 1 and 100, inclusive) and determines
 * which (if any) variation should be matched.
 */
Mozilla.TrafficCop.prototype.generateRedirectUrl = function(url, querystring) {
    var redirect;
    var runningTotal;

    // conjure a random number between 1 and 100 (inclusive)
    var rando = Math.floor(Math.random() * 100) + 1;

    url = url || window.location;
    querystring = querystring || window.location.search;

    // check to see if user has a cookie from a previously visited variation
    // also make sure variation in cookie is still valid (you never know)
    if (Mozilla.Cookies.hasItem(this.id)) {
        // if the cookie is a variation, grab it and proceed
        if (this.variations[Mozilla.Cookies.getItem(this.id)]) {
            this.redirectVariation = Mozilla.Cookies.getItem(this.id);
        // if the cookie is no variation, return the unset redirect to keep user
        // in the same (no variation) cohort
        } else if (Mozilla.Cookies.getItem(this.id) === Mozilla.TrafficCop.noVariationCookieValue) {
            return Mozilla.TrafficCop.noVariationCookieValue;
        }
    } else {
        // make sure random number falls in the distribution range
        if (rando <= this.totalPercentage) {
            runningTotal = 0;

            // loop through all variations
            for (var v in this.variations) {
                // check if random number falls within current variation range
                if (rando <= (this.variations[v] + runningTotal)) {
                    this.redirectVariation = v;
                    break;
                }

                // tally variation percentages for the next loop iteration
                runningTotal += this.variations[v];
            }
        }
    }

    // if a variation was chosen, construct a new URL
    if (this.redirectVariation) {
        if (querystring) {
            redirect = url + querystring + '&' + this.redirectVariation;
        } else {
            redirect = url + '?' + this.redirectVariation;
        }
    }

    return redirect;
};


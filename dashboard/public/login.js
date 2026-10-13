(function () {
  'use strict';
  var form = document.getElementById('loginForm');
  var pin = document.getElementById('pin');
  var error = document.getElementById('loginError');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    error.textContent = '';
    try {
      var response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.value })
      });
      var data = await response.json();
      if (response.ok) {
        location.href = '/' + location.search;
        return;
      }
      if (response.status === 429) {
        error.textContent = 'Too many attempts. Try again in ' + Math.ceil(data.retryAfterMs / 1000) + ' s.';
      } else {
        error.textContent = data.error || 'Login failed';
      }
      pin.value = '';
    } catch (e) {
      error.textContent = 'Could not reach Homey: ' + e.message;
    }
  });
})();

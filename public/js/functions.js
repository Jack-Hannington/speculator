document.addEventListener("DOMContentLoaded", function () {
    var navToggleButton = document.getElementById("navToggle");
    var sidebarNav = document.querySelector(".sidebar-nav");
    var navIcon = document.querySelector('#nav-icon1');

    if (navToggleButton) {
        navToggleButton.addEventListener("click", function () {
            if (sidebarNav.classList.contains("show")) {
                // Closing the sidebar
                sidebarNav.classList.add("animate__slideOutRight", "animate__animated");
                navIcon.classList.add('open');

                setTimeout(function () {
                    // document.body.style.overflowY = "auto"; // Allow scrolling again
                    sidebarNav.classList.remove(
                        "show",
                        "animate__slideOutRight",
                        "animate__animated"
                    );
                    navIcon.classList.remove('open');
                }, 100);
            } else {
                // Opening the sidebar
                document.body.style.overflowY = "hidden"; // Prevent scrolling when menu is active
                sidebarNav.classList.add(
                    "",
                    "animate__slideInRight",
                    "animate__animated"
                );
                navIcon.classList.add('open');
            }
        });
    }


    const flashMessageContainer = document.querySelector('.flash-messages-container');
    if (flashMessageContainer) {
        // Add the slide-in animation class from Animate.css
        flashMessageContainer.classList.add('animate__animated', 'animate__slideInRight');

        // Set a timeout to change to the slide-out animation after 3 seconds
        setTimeout(() => {
            // First, remove the slide-in class
            flashMessageContainer.classList.remove('animate__slideInRight');
            // Then, add the slide-out class
            flashMessageContainer.classList.add('animate__slideOutRight');

            // Optional: remove the element from DOM after the slide-out animation completes
            setTimeout(() => {
                flashMessageContainer.remove();
            }, 1000);
        }, 4000); // Display for 3000 ms before sliding out
    }

    const navLinks = document.querySelectorAll('.sidebar-nav a');

    navLinks.forEach(link => {
        if (link.href === window.location.href) {
            link.classList.add('active');
        } else if (link.getAttribute('href') === '/' && window.location.pathname === '/') {
            link.classList.add('active');
        }
    });
});





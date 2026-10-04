# Purin

A custard pudding you can pull, wobble and slice. Plain static site, no build step.

    index.html   page + controls
    style.css    layout and colours (light + dark)
    sim.js       soft-body physics and cutting (no dependencies)
    main.js      three.js scene, input, knife animation

three.js r147 loads from jsDelivr, fonts from Google Fonts.

Run locally: `npx serve .` (or `python3 -m http.server`) and open http://localhost:3000.
Deploy: drag the folder into Netlify Drop, or push to GitHub and import on Vercel / enable GitHub Pages.

// Nav shadow on scroll
  const nav = document.getElementById("nav");
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 10);
  });

  // Scroll-reveal for cards/steps
  const revealEls = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));

  // Decorative hero waveform — a fixed illustrative carbon-intensity curve,
  // not live data (this page has no backend). Purely visual motif.
  const canvas = document.getElementById("heroWave");
  const ctx = canvas.getContext("2d");
  function drawWave(t){
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w*dpr; canvas.height = h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const n = 140;
    const pts = [];
    for(let i=0;i<n;i++){
      const x = (i/(n-1))*w;
      const v = 0.5 + 0.28*Math.sin(i*0.18 + t) + 0.12*Math.sin(i*0.5 + t*1.7);
      pts.push({x, y: h - v*h});
    }
    ctx.beginPath();
    pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    const grad = ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,"#3DDC84");
    grad.addColorStop(0.5,"#F2B84B");
    grad.addColorStop(1,"#4FD1E8");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  let t = 0;
  function animateWave(){
    t += 0.01;
    drawWave(t);
    requestAnimationFrame(animateWave);
  }
  animateWave();

  // Mobile menu (simple toggle, no backend needed)
  // Not wired to a visible button in this minimal layout — links collapse
  // gracefully since the nav stacks under 800px via CSS alone.

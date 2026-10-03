-- Demo data for the deployed app: a fictional client, "Acme Logistics", reviewing its new site.
-- Anchors were captured by clicking the real elements of the demo site (e2e/site), so every pin lands
-- on its element. Run once in the Supabase SQL editor AFTER you have signed up on the deployed app:
--   1. set v_email to the email you signed up with, and v_site to the demo site's address;
--   2. run. AI triage for these comments is queued and runs within a few minutes (job ticker).

do $demo$
declare
  v_email text := 'neilthomasmathew123@gmail.com';
  v_site  text := 'https://basefeed-demo.vercel.app';
  v_user uuid;
  v_name text;
  v_ws uuid;
  v_project uuid;
  v_page_home uuid;
  v_page_pricing uuid;
  v_priya uuid;
  v_marcus uuid;
  v_comment uuid;
  v_ids uuid[] := '{}';
begin
  v_site := rtrim(v_site, '/');
  select u.id into v_user from auth.users u where lower(u.email) = lower(v_email);
  if v_user is null then raise exception 'No user with email %: sign up on the deployed app first', v_email; end if;
  select coalesce(nullif(p.name, ''), 'Team') into v_name from public.profiles p where p.id = v_user;
  select m.workspace_id into v_ws from public.workspace_members m where m.user_id = v_user order by m.created_at limit 1;
  if exists (select 1 from public.projects where public_key = 'pk_ac3e0000000000000000b9d1') then
    raise exception 'The demo project already exists';
  end if;

  insert into public.projects (workspace_id, name, site_url, public_key, allowed_origins, created_by)
  values (v_ws, 'Acme Logistics (demo)', v_site, 'pk_ac3e0000000000000000b9d1', array[v_site], v_user)
  returning id into v_project;
  insert into public.pages (project_id, url, title) values (v_project, v_site || '/', 'Home') returning id into v_page_home;
  insert into public.pages (project_id, url, title) values (v_project, v_site || '/pricing', 'Pricing') returning id into v_page_pricing;
  insert into public.guests (project_id, name, email) values (v_project, 'Priya Raman', 'priya@acmelogistics.example') returning id into v_priya;
  insert into public.guests (project_id, name, email) values (v_project, 'Marcus Lee', 'marcus@acmelogistics.example') returning id into v_marcus;

  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, v_user, null, v_name, 'The illustration looks soft on retina screens. Re-export at 2x as WebP.', 'medium', 'resolved',
    replace($j${"v": 1, "key": "L|div|811c9dc5|aria-label=Product illustration&role=img", "tag": "div", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2)", "text": "", "attrs": {"role": "img", "aria-label": "Product illustration"}, "scope": null, "digest": "", "offset": {"x": 0.4988466674760228, "y": 0.4983205859738578}, "prefix": " dispatchers stop chasing drivers for updates. Start free trial ", "suffix": "NORTHWINDCONTOSOINITECHGLOBEXUMBRELLA Built for the people who k", "unique": true, "classes": ["home_hero_visual"], "excerpt": "", "selector": "div.home_hero_visual", "parentSig": "51c3525a"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 386, "w": 515}, "text": "", "styles": {"gap": "normal", "color": "rgb(16, 20, 24)", "display": "block", "opacity": "1", "font-size": "16px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "400", "line-height": "25.6px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "18px", "margin-bottom": "0px", "padding-right": "0px", "letter-spacing": "normal", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "macOS", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Chrome 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36", "breakpoint": "desktop", "elementClasses": ["home_hero_visual"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '72 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.replies (comment_id, project_id, author_user_id, author_guest_id, author_name, body, created_at)
  values (v_comment, v_project, v_user, null, v_name, 'Swapped in a 2x WebP. Crisp now and 40% smaller.', now() - interval '70 hours');
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, null, v_priya, 'Priya Raman', 'The headline wraps awkwardly on my laptop. Can we keep "one live map." together on the second line?', 'high', 'open',
    replace($j${"v": 1, "key": "L|h1|38e03123|", "tag": "h1", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > h1:nth-of-type(1)", "text": "every truck, every route, one live map.", "attrs": {}, "scope": null, "digest": "every truck, every route, one live map.", "offset": {"x": 0.4990563226383232, "y": 0.49282487377092743}, "prefix": "ACME Product Pricing Customers Book a demo ", "suffix": " Acme gives logistics teams real-time visibility across their fl", "unique": true, "classes": ["heading-style-h1"], "excerpt": "Every truck, every route, one live map.", "selector": "h1.heading-style-h1", "parentSig": "dcba4502"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 118, "w": 629}, "text": "Every truck, every route, one live map.", "styles": {"gap": "normal", "color": "rgb(16, 20, 24)", "display": "block", "opacity": "1", "font-size": "56px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "700", "line-height": "58.8px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "0px", "margin-bottom": "20px", "padding-right": "0px", "letter-spacing": "-1.68px", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "macOS", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Chrome 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36", "breakpoint": "desktop", "elementClasses": ["heading-style-h1"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '50 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, null, v_priya, 'Priya Raman', 'Sales wants this to say "Book a demo" instead. We''re not offering free trials this quarter.', 'medium', 'in_progress',
    replace($j${"v": 1, "key": "L|a|a4d97e0f|data-w-id=a1b2c3&href=#", "tag": "a", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)", "text": "start free trial", "attrs": {"href": "#", "data-w-id": "a1b2c3"}, "scope": null, "digest": "start free trial", "offset": {"x": 0.4966442953020134, "y": 0.49183673469387756}, "prefix": "s their fleet, so dispatchers stop chasing drivers for updates. ", "suffix": " NORTHWINDCONTOSOINITECHGLOBEXUMBRELLA Built for the people who ", "unique": true, "classes": ["button"], "excerpt": "Start free trial", "selector": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)", "parentSig": "dcba4502"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 54, "w": 149}, "text": "Start free trial", "styles": {"gap": "normal", "color": "rgb(255, 255, 255)", "display": "inline-block", "opacity": "1", "font-size": "16px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "600", "line-height": "25.6px", "margin-left": "0px", "padding-top": "14px", "margin-right": "0px", "padding-left": "24px", "border-radius": "10px", "margin-bottom": "0px", "padding-right": "24px", "letter-spacing": "normal", "padding-bottom": "14px", "background-color": "rgb(59, 91, 255)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "macOS", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Chrome 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36", "breakpoint": "desktop", "elementClasses": ["button"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '49 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.replies (comment_id, project_id, author_user_id, author_guest_id, author_name, body, created_at)
  values (v_comment, v_project, v_user, null, v_name, 'Updating the button text and pointing it at the demo form now.', now() - interval '30 hours');
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, v_user, null, v_name, 'This secondary button is too light on the white card (about 3:1 contrast). Darken it to the brand navy.', 'low', 'open',
    replace($j${"v": 1, "key": "L|a|bbe0c61a|href=#", "tag": "a", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)", "text": "learn more", "attrs": {"href": "#"}, "scope": {"rel": "a:nth-of-type(1)", "tag": "div", "prefix": "ry five seconds, with ETAs that account for traffic. Learn more ", "suffix": "Proof of delivery Photos and signatures are attached to every st", "textHash": "aad10e78"}, "digest": "learn more", "offset": {"x": 0.4939759036144578, "y": 0.489010989010989}, "prefix": "ch Assign loads to the nearest available driver with one click. ", "suffix": " Proof of delivery Photos and signatures are attached to every s", "unique": false, "classes": ["button", "is-secondary"], "excerpt": "Learn more", "selector": "body > main:nth-of-type(1) > section:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)", "parentSig": "fbc3cbdd"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 26, "w": 83}, "text": "Learn more", "styles": {"gap": "normal", "color": "rgb(59, 91, 255)", "display": "inline-block", "opacity": "1", "font-size": "16px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "600", "line-height": "25.6px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "10px", "margin-bottom": "0px", "padding-right": "0px", "letter-spacing": "normal", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "macOS", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Chrome 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36", "breakpoint": "desktop", "elementClasses": ["button", "is-secondary"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '46 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, null, v_marcus, 'Marcus Lee', 'Please swap Contoso for our new customer, Northwind Freight. The logo is in the shared drive.', 'medium', 'open',
    replace($j${"v": 1, "key": "L|span|f9e1dfa0|", "tag": "span", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2)", "text": "contoso", "attrs": {}, "scope": null, "digest": "contoso", "offset": {"x": 0.49797719749908054, "y": 0.4804639804639805}, "prefix": "ers stop chasing drivers for updates. Start free trial NORTHWIND", "suffix": "INITECHGLOBEXUMBRELLA Built for the people who keep freight movi", "unique": true, "classes": [], "excerpt": "CONTOSO", "selector": "body > main:nth-of-type(1) > section:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2)", "parentSig": "6ebeef92"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 26, "w": 85}, "text": "CONTOSO", "styles": {"gap": "normal", "color": "rgb(154, 163, 178)", "display": "block", "opacity": "1", "font-size": "16px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "700", "line-height": "25.6px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "0px", "margin-bottom": "0px", "padding-right": "0px", "letter-spacing": "1.28px", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "Windows", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Edge 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0", "breakpoint": "desktop", "elementClasses": []}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '28 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, null, v_priya, 'Priya Raman', 'On my phone the headline runs off the side of the screen.', 'urgent', 'open',
    replace($j${"v": 1, "key": "L|h1|38e03123|", "tag": "h1", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > h1:nth-of-type(1)", "text": "every truck, every route, one live map.", "attrs": {}, "scope": null, "digest": "every truck, every route, one live map.", "offset": {"x": 0.08404558404558404, "y": 0.27189141856392296}, "prefix": "ACME Product Pricing Customers Book a demo ", "suffix": " Acme gives logistics teams real-time visibility across their fl", "unique": true, "classes": ["heading-style-h1"], "excerpt": "Every truck, every route, one live map.", "selector": "h1.heading-style-h1", "parentSig": "dcba4502"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 71, "w": 351}, "text": "Every truck, every route, one live map.", "styles": {"gap": "normal", "color": "rgb(16, 20, 24)", "display": "block", "opacity": "1", "font-size": "34px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "700", "line-height": "35.7px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "0px", "margin-bottom": "20px", "padding-right": "0px", "letter-spacing": "-1.02px", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 390}$j$::jsonb,
    replace($j${"os": "iOS", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "mobile", "scroll": {"x": 0, "y": 0}, "browser": "Safari 19", "viewport": {"h": 1269, "w": 390}, "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1", "breakpoint": "mobile-portrait", "elementClasses": ["heading-style-h1"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '26 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_home, null, v_marcus, 'Marcus Lee', 'Can we hide Customers until the case studies are ready? Right now it goes nowhere.', 'low', 'open',
    replace($j${"v": 1, "key": "L|a|c09344de|href=#", "tag": "a", "kind": "leaf", "path": "body > div:nth-of-type(1) > nav:nth-of-type(1) > a:nth-of-type(3)", "text": "customers", "attrs": {"href": "#"}, "scope": null, "digest": "customers", "offset": {"x": 0.495, "y": 0.46886446886446886}, "prefix": "ACME Product Pricing ", "suffix": " Book a demo Every truck, every route, one live map. Acme gives ", "unique": true, "classes": ["navbar_link"], "excerpt": "Customers", "selector": "body > div:nth-of-type(1) > nav:nth-of-type(1) > a:nth-of-type(3)", "parentSig": "f6cd177d"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 26, "w": 75}, "text": "Customers", "styles": {"gap": "normal", "color": "rgb(91, 100, 112)", "display": "block", "opacity": "1", "font-size": "16px", "margin-top": "0px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "400", "line-height": "25.6px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "0px", "margin-bottom": "0px", "padding-right": "0px", "letter-spacing": "normal", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "Windows", "dpr": 1, "url": "http://localhost:4000/?bn_feedback=embed", "title": "Acme: logistics software for modern fleets", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Edge 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0", "breakpoint": "desktop", "elementClasses": ["navbar_link"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '20 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;
  insert into public.replies (comment_id, project_id, author_user_id, author_guest_id, author_name, body, created_at)
  values (v_comment, v_project, null, v_marcus, 'Marcus Lee', 'Or point it at the testimonials section for now, either works.', now() - interval '19 hours');
  insert into public.comments (project_id, page_id, author_user_id, author_guest_id, author_name, body, priority, status, anchor, snapshot, context, anchor_state, created_at)
  values (v_project, v_page_pricing, null, v_marcus, 'Marcus Lee', 'Growth goes up to $24 per vehicle from next month, not $19.', 'high', 'open',
    replace($j${"v": 1, "key": "L|div|de731acd|", "tag": "div", "kind": "leaf", "path": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1)", "text": "$19", "attrs": {}, "scope": null, "digest": "$19", "offset": {"x": 0.5, "y": 0.48634850166481686}, "prefix": "p to 25 vehicles. Live tracking and ETAs. Choose Starter Growth ", "suffix": " Up to 250 vehicles. Dispatch and proof of delivery. Choose Grow", "unique": true, "classes": ["pricing_price"], "excerpt": "$19", "selector": "body > main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1)", "parentSig": "1af0239c"}$j$, 'http://localhost:4000', v_site)::jsonb,
    $j${"v": 1, "src": null, "size": {"h": 70, "w": 318}, "text": "$19", "styles": {"gap": "normal", "color": "rgb(16, 20, 24)", "display": "block", "opacity": "1", "font-size": "44px", "margin-top": "8px", "text-align": "start", "font-family": "system-ui, -apple-system, \"Segoe UI\", sans-serif", "font-weight": "800", "line-height": "70.4px", "margin-left": "0px", "padding-top": "0px", "margin-right": "0px", "padding-left": "0px", "border-radius": "0px", "margin-bottom": "16px", "padding-right": "0px", "letter-spacing": "normal", "padding-bottom": "0px", "background-color": "rgba(0, 0, 0, 0)"}, "viewportWidth": 1440}$j$::jsonb,
    replace($j${"os": "Windows", "dpr": 1, "url": "http://localhost:4000/pricing?bn_feedback=embed", "title": "Pricing · Acme", "device": "desktop", "scroll": {"x": 0, "y": 0}, "browser": "Edge 153", "viewport": {"h": 2031, "w": 1440}, "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0", "breakpoint": "desktop", "elementClasses": ["pricing_price"]}$j$, 'http://localhost:4000', v_site)::jsonb,
    'attached', now() - interval '5 hours')
  returning id into v_comment;
  v_ids := v_ids || v_comment;

  -- No notification emails for demo data; queue AI triage instead (the job ticker runs it).
  delete from public.jobs where kind = 'notify' and (payload ->> 'comment_id')::uuid = any (v_ids);
  delete from public.jobs where kind = 'notify' and (payload ->> 'reply_id')::uuid in (select id from public.replies where comment_id = any (v_ids));
  insert into public.jobs (kind, payload, idempotency_key)
  select 'triage', jsonb_build_object('commentId', id), 'triage:' || id from unnest(v_ids) as id;

  raise notice 'Demo project created with % comments', array_length(v_ids, 1);
end
$demo$;

You are updating the Calisto Eyewear conversational assistant architecture and support flow.

IMPORTANT:
The current assistant behavior is incorrect in multiple places and must be restructured.

The assistant should behave like:

* luxury eyewear assistant
* product recommendation assistant
* policy FAQ assistant
* after-sales support assistant
* appointment guidance assistant

The flow should feel conversational, structured, premium, and context-aware.

==================================================

1. MAIN GREETING FLOW UPDATE
    ==================================================

OLD GREETING MENU:

* Browse Eyewear
* Check Pricing
* Book Appointment

NEW GREETING MENU:

* Browse Eyewear
* Check Pricing
* Support & Policies

IMPORTANT:
Remove “Book Appointment” as a primary homepage option.

Appointment booking should only happen contextually from:

* product cards
* support actions
* store flow
* escalation flow

==================================================
2. PRODUCT FLOW CTA UPDATE

OLD PRODUCT CTA:

* Open Product Link
* Book Visit
* Consult Now

NEW PRODUCT CTA:

* Open Product Link
* Book Visit
* Ask a Question

Replace ALL occurrences of:
“Consult Now”

WITH:
“Ask a Question”

==================================================
3. POST-RECOMMENDATION FLOW UPDATE

OLD:

* Find Nearest Store
* Book Appointment
* Talk to Consultant

NEW:

* Find Nearest Store
* Support & Policies

Remove:

* Book Appointment
* Talk to Consultant

==================================================
4. STORE FLOW UPDATE

OLD STORE CTA:

* Map
* Book Visit

NEW STORE CTA:

* Map
* Support & Policies

==================================================
5. CHECK PRICING FLOW UPDATE

OLD FOLLOW-UP:

* Lens Options
* Find Store
* Talk to Consultant

NEW FOLLOW-UP:

* Lens Options
* Find Store
* Support & Policies

==================================================
6. LENS OPTIONS FLOW UPDATE

OLD FOLLOW-UP:

* Set Budget
* Find Store
* Talk to Consultant

NEW FOLLOW-UP:

* Set Budget
* Find Store
* Support & Policies

==================================================
7. REMOVE AGGRESSIVE ESCALATION BEHAVIOR

CURRENT PROBLEM:
The assistant escalates too aggressively.

Current incorrect behavior:

* immediate lead collection
* immediate escalation
* repeated “team will contact you shortly”

This creates poor UX and makes the assistant feel like a generic lead capture bot instead of a premium support assistant.

==================================================
CORRECT ESCALATION LOGIC

ONLY escalate when the user has:

* return request
* refund request
* warranty claim
* damaged product issue
* exchange request
* repair issue
* explicit support request

==================================================
DO NOT ESCALATE FOR:

The assistant should NOT escalate for:

* general FAQ
* policy inquiry
* contact information
* store information
* pricing questions
* informational queries

==================================================
IMPORTANT DISTINCTION

There are TWO different user behaviors:

⸻

CASE 1:
POLICY / FAQ QUESTION

Examples:

* “What is your return policy?”
* “What warranty do you provide?”
* “How long is the warranty?”
* “Can I exchange products?”
* “Do you allow refunds?”

EXPECTED BEHAVIOR:

1. Retrieve policy chunk from remote DB
2. Show policy information
3. STOP there unless the user explicitly asks for support

OPTIONAL FOLLOW-UP BUTTONS:

* Start Return Request
* File Warranty Claim
* Exchange Product
* Back

IMPORTANT:
DO NOT automatically collect leads.
DO NOT automatically escalate.
DO NOT immediately say:
“Our team will contact you shortly.”

The user may only be asking for information.

⸻

CASE 2:
ACTUAL SUPPORT REQUEST

Examples:

* “I need to return my glasses”
* “My glasses are damaged”
* “I want refund”
* “I need replacement”
* “My frame broke under warranty”
* “I want to exchange this product”

EXPECTED BEHAVIOR:

1. Retrieve relevant policy chunk from remote DB
2. Show policy information first
3. THEN collect support lead
4. THEN escalate to support team

Lead collection should include:

* customer name
* phone/email
* issue description
* store/purchase details if available

FINAL RESPONSE:
“Thank you. Your request has been shared with the Calisto support team. A team member will contact you shortly regarding your request.”

==================================================
8. SUPPORT & POLICIES MAIN FLOW

When user clicks:
“Support & Policies”

DO NOT collect lead immediately.

Instead show:

“How can we assist you today?”

Buttons:

* Warranty Policy
* Return & Refund Policy
* Support Actions

==================================================
9. WARRANTY POLICY FLOW

When user clicks:
“Warranty Policy”

STEP 1:
Retrieve warranty policy chunk dynamically from remote DB.

Possible chunk categories:

* warranty_policy
* frame_warranty
* lens_warranty

DO NOT hardcode policy responses.

STEP 2:
Display warranty information naturally.

STEP 3:
After policy display, ask:

Buttons:

* File Warranty Claim
* Back

==================================================
10. RETURN & REFUND POLICY FLOW

When user clicks:
“Return & Refund Policy”

STEP 1:
Retrieve return/refund policy chunk dynamically from remote DB.

Possible chunk categories:

* return_policy
* refund_policy
* exchange_policy

DO NOT hardcode responses.

STEP 2:
Display policy information naturally.

STEP 3:
After policy display, ask:

Buttons:

* Start Return Request
* Exchange Product
* Back

==================================================
11. SUPPORT ACTIONS FLOW

When user clicks:
“Support Actions”

Show buttons:

* Book Appointment
* Email Support
* Visit Store
* Ask Another Question

==================================================
12. BOOK APPOINTMENT FLOW CHANGE

CURRENT PROBLEM:
Book Appointment immediately triggers lead collection.

THIS IS INCORRECT.

==================================================
NEW BOOK APPOINTMENT FLOW

When user clicks:

* Book Appointment
* Book Visit

STEP 1:
Retrieve booking instructions dynamically from remote DB.

Possible chunk categories:

* booking_information
* appointment_booking
* eye_test_booking

Example chunk:
“You can conveniently book an eye examination or consultation through our online booking portal:
https://client.calisto.co/home”

DO NOT hardcode booking responses.

STEP 2:
Display booking instructions naturally.

STEP 3:
Show buttons:

* Visit Booking Website
* Find Store
* Ask Another Question

IMPORTANT:
Do NOT immediately collect leads.
Do NOT escalate automatically.
Do NOT ask qualification questions unless the user explicitly requests assistance.

==================================================
13. EMAIL SUPPORT FLOW

When user clicks:
“Email Support”

Respond ONLY with:

“For further assistance, please contact:
calisto123@gmail.com”

No lead collection.
No escalation.
No FAQ retrieval.

==================================================
14. VISIT STORE FLOW

When user clicks:
“Visit Store”

Route user to store locator flow.

==================================================
15. ASK A QUESTION FLOW

CURRENT PROBLEM:
“Ask a Question” incorrectly triggers qualification flow.

THIS IS WRONG.

==================================================
CORRECT BEHAVIOR

When user clicks:
“Ask a Question”

Show:

“What would you like help with?”

Buttons:

* Product Availability
* Lens Guidance
* Warranty & Returns
* Store Information
* Other Questions

DO NOT ask:
“How soon are you planning to make a decision?”

That question belongs ONLY to:

* actual appointment/lead flow

==================================================
16. MERGED POLICY + SUPPORT FLOW

OLD:

* FAQ flow
* support escalation flow

were separate.

NEW:
They must work together seamlessly.

==================================================
EXPECTED BEHAVIOR

USER:
“What is your return policy?”

EXPECTED:

1. Retrieve policy chunk from remote DB
2. Show policy information
3. Ask:
    * Start Return Request
    * Exchange Product
    * Back

ONLY collect lead if user chooses:

* Start Return Request
* Exchange Product

⸻

USER:
“I need to return my glasses”

EXPECTED:

1. Retrieve return/refund policy chunk
2. Show policy information
3. Collect lead immediately
4. Confirm escalation

⸻

USER:
“My frame broke under warranty”

EXPECTED:

1. Retrieve warranty chunk
2. Show warranty coverage
3. Collect lead
4. Confirm escalation

==================================================
17. LEAD COLLECTION FLOW

ONLY triggered for:

* return request
* warranty claim
* exchange request
* damaged product issue
* explicit support escalation

Collect:

* customer name
* phone/email
* issue description
* store/purchase details if available

After collection:

Respond:
“Thank you. Your request has been shared with the Calisto support team. A team member will contact you shortly regarding your request.”

==================================================
18. PRODUCT FILTERING REQUIREMENT

Filtering logic must remain STRICT.

ALWAYS filter by:

1. product_type column
2. brand column
3. budget

DO NOT mix:

* Designer Frames
* Luxury Sunglasses
* Contact Lenses

Example:
If user selects:
Luxury Sunglasses + Bottega Veneta

ONLY retrieve:

* product_type = Luxury Sunglasses
* brand = Bottega Veneta

==================================================
19. FIX FAQ RETRIEVAL ISSUES

CURRENT PROBLEM:
Queries retrieve unrelated chunks.

Example:
“how can i contact you”
retrieved general company FAQ.

THIS IS INCORRECT.

Improve semantic retrieval and intent routing.

Examples:

“how can i contact you”
→ contact/support chunk

“return policy”
→ return_policy chunk

“warranty”
→ warranty_policy chunk

“book appointment”
→ booking_information chunk

==================================================
20. ERROR HANDLING

Conversation Recovery / Error Handling
│
├── Invalid Selection
│   └── Re-prompt previous question
│
├── Context Loss
│   └── Return to main menu
│
├── Duplicate Prompt Issue
│   └── Prevent repeated lead qualification questions
│
└── Navigation Interruptions
└── User changed flow mid-conversation

==================================================
21. UX REQUIREMENTS

1. Preserve conversation context.
2. Avoid repeated escalation.
3. Avoid aggressive lead collection.
4. Maintain premium conversational tone.
5. Policies must come from remote DB chunks.
6. Responses should feel natural and guided.
7. Escalate ONLY when necessary.
8. Never abruptly switch flows.
9. Avoid dead-end conversations.
10. Keep transitions smooth and contextual.

==================================================
EXPECTED FINAL EXPERIENCE

The assistant should feel like:

* premium retail assistant
* intelligent support assistant
* eyewear consultant
* after-sales support coordinator
* guided shopping assistant

NOT:

* generic lead capture bot
* aggressive escalation chatbot

==================================================
22. CONVERSATION FLOW ENHANCEMENT: GUIDED BROWSING VS DIRECT SEARCH

Objective:

Separate product discovery into two distinct modes:

1. Guided Browsing Mode (Button Payloads)
2. Direct Search Mode (Free Text)

The assistant must determine which mode is being used and behave accordingly.

──────────────────────────────
MODE 1: GUIDED BROWSING
──────────────────────────────

Triggered only when users enter product discovery through button payloads such as:

* Browse Eyewear
* Sunglasses
* Designer Frames
* Contact Lenses
* Lens Solutions
* Shop Now
* Show Products

In Guided Browsing Mode:

The assistant may ask follow-up questions to refine results.

Examples:

Contact Lenses
Ask:
* Brand
* Lens duration
* Multifocal preference
* Budget

Sunglasses
Ask:
* Brand
* Gender
* Polarized preference
* UV protection preference
* Budget

Frames
Ask:
* Brand
* Shape
* Material
* Gender
* Budget

Lens Solutions
Ask:
* Lens type
* Blue light protection
* Progressive or bifocal
* Budget

Guided Browsing Mode should continue using the existing button-driven filtering experience.

──────────────────────────────
MODE 2: DIRECT SEARCH
──────────────────────────────

Triggered when the user types a free-text request.

Examples:

* I need sunglasses
* Show me sunglasses
* I need contact lenses
* Show contact lenses
* I need blue light glasses
* I need polarized sunglasses
* Show me progressive lenses
* I need office glasses
* Recommend eyewear for driving
* I need UV protection glasses

In Direct Search Mode:

DO NOT start the guided questionnaire.

DO NOT ask:

* Which brand?
* What budget?
* Which style?
* Which shape?

Instead:

Immediately search the catalog.

──────────────────────────────
DEFAULT SEARCH BEHAVIOR
──────────────────────────────

If the user did not specify a brand:
Use all brands.
Do not ask for brand.

──────────────────────────────

If the user did not specify a budget:
Use all price ranges.
Do not ask for budget.

──────────────────────────────

If the user did not specify gender:
Use all genders.
Do not ask for gender.

──────────────────────────────

If the user did not specify frame shape:
Use all shapes.
Do not ask for frame shape.

──────────────────────────────

Search immediately using available information.

──────────────────────────────
EXAMPLES
──────────────────────────────

User:
“I need contact lenses”

Search:
category = Contact Lenses

Return products immediately.
Do not ask brand.
Do not ask budget.

After showing results:
Optional quick filters:
* Daily
* Monthly
* Multifocal
* More Like These

──────────────────────────────

User:
“I need sunglasses”

Search:
category = Sunglasses

Return products immediately.

After results:
Optional quick filters:
* Polarized
* UV Protection
* Men
* Women
* Under RM300

──────────────────────────────

User:
“I need blue light glasses”

Search:
lens_feature contains Blue Light

Return products immediately.
Do not ask budget first.

──────────────────────────────

User:
“I need office glasses”

Infer:
lens_feature contains Blue Light

Search immediately.
Return products.

──────────────────────────────

User:
“I need polarized sunglasses”

Search:
category = Sunglasses
AND
polarized = yes

Return products immediately.

──────────────────────────────
POST-RESULT REFINEMENT
──────────────────────────────

After products are shown, the assistant may offer optional refinements.

Example:

“I found 24 matching products.

Would you like to narrow them down by:

• Brand
• Budget
• Frame Shape
• Lens Features”

These refinements are optional.
Never force users through the questionnaire before showing products.

──────────────────────────────
PRIORITY RULE
──────────────────────────────

Free text search intent always overrides guided browsing.

If a user clearly expresses a product need in natural language:
Search first.
Ask refinement questions later.

Never force the guided browsing flow onto a direct-search user.
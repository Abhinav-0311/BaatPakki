# BaatPakki — Say it. Check it. Pakki.

**Problem.** A short service request can contain a changed appointment time, a spending limit, and an instruction such as “call me before filling gas.” Losing one of those details can turn a simple request into a dispute.

**Solution.** BaatPakki is a Hindi/Hinglish voice intake workspace for an AC-service business. Customers speak or type their request. A structured job card captures the reported problem, requested work, preferred visit, contact details, maximum budget and approval conditions. The customer can inspect source text, make corrections, listen to a full readback and confirm the exact reviewed version.

**Gnani integration.** Gnani Prisma v3.0 transcribes short microphone recordings with Hindi/English hints and service vocabulary. Gnani Timbre v3.0, using the Shivani voice, speaks clarification questions and the final readback. Credentials stay on the backend. A focused local parser handles supported Hindi/Hinglish phrases; there is no additional LLM dependency.

**What matters.** “Four—sorry, six PM” updates the time. ₹800 stays a maximum budget, not a quoted charge. Gas-filling approval instructions are retained. Any material correction resets confirmation. Customer confirmation records the request; the business must separately accept the visit.

**Users and scope.** The first version serves one small AC-service business and its customers, running locally in a browser. It supports manual correction, stored confirmed revisions and a printable job card. Typed entry remains available without microphone access. Saved examples are labelled separately from live requests.

**Validation and limitations.** Regression tests exercise corrections, restrictions, ambiguous input, evidence, confirmation versions, audio validation, session isolation and persistence. A short synthetic Timbre-to-Prisma round trip has been verified live. The parser is deliberately narrow, and every card needs user review. Physical microphone quality and broader noisy-speech accuracy require further testing. Payments, technician dispatch and calendar booking are outside this release.

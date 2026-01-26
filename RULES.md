1. Use Electron with a modern, professional UI.
2. Provide a Site Manager to add and store SSH credentials.
3. Allow multiple simultaneous SSH connections using tabs.
4. Each tab must show a terminal on the left and a chatbox on the right.
5. Include a Settings modal with:
   5.1. OpenAI API key input.
   5.2. Execution mode: Ask Every Time or Run Everything.
   5.3. Max retries/follow-up defaulting to 10.
   5.4. Model selection defaulting to gpt-5.2.
6. Chatbox workflow:
   6.1. Convert user requests into SSH commands via OpenAI.
   6.2. Execute the command in the SSH terminal.
   6.3. If execution fails, collect logs and ask OpenAI for a fix.
   6.4. Repeat command execution and follow-up until max retries is reached.

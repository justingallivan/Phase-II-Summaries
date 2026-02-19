# Dynamics Explorer Guide

Query your Dynamics 365 CRM data using natural language. No need to write OData queries — just ask questions in plain English.

## Overview

Dynamics Explorer is an AI-powered chatbot that translates your questions into CRM queries, executes them, and presents the results in a readable format. It understands the CRM schema and can search across all indexed tables.

## Getting Started

1. Open **Dynamics Explorer** from the home page or navigation
2. Type a question in the chat box
3. The AI processes your request, queries the CRM, and returns results

## What You Can Ask

### Finding Records

- "Find all requests from Stanford University"
- "Show me proposals submitted in 2024"
- "Look up request number 1001289"
- "Find contacts with email ending in @mit.edu"

### Searching by Content

- "Search for proposals about fungi"
- "Find requests mentioning CRISPR"
- "Search for anything related to quantum computing"

Content searches use the Dataverse Search API, which searches across all indexed text fields simultaneously — including proposal abstracts.

### Counting and Summarizing

- "How many active requests are there?"
- "Count proposals by status"
- "What are the most common research topics this year?"

### Exploring Relationships

- "Who are the contacts for request 1001289?"
- "Show me the review history for this proposal"
- "What documents are linked to this request?"

## Understanding Results

Results are displayed as formatted tables or summaries depending on the query type:

- **Record lists** show key fields in a table with clickable details
- **Single records** show all relevant fields in a structured view
- **Counts** are presented as numbers with context
- **Search results** include relevance scores and highlighted matching text

## Multi-Turn Conversations

The chat maintains context across messages, so you can:

1. Ask "Show me requests from 2024"
2. Follow up with "Which of those are from California?"
3. Then "Show me the details for the third one"

The AI remembers previous results and can refine or drill into them.

## Exporting Data

- Click **Export Chat** to download the conversation including all query results
- Tables in results can be copied to clipboard for pasting into spreadsheets

## Tips

- **Be specific** — "Find requests from Stanford" works better than "Show me some university requests"
- **Use field names** if you know them — "Filter by akoya_requeststatus = Active" gives precise results
- **Ask for help** — "What tables are available?" or "What fields does the request table have?" to explore the schema
- **Narrow searches** — If a search returns too many results, add qualifiers: time range, institution, status, etc.
- **Natural dates work** — "Requests from last month", "Proposals submitted before January 2024"

## Limitations

- Results are limited by CRM query size limits (typically 5,000 records per query)
- Some tables or fields may be restricted based on your role
- Complex aggregations (averages, percentiles) may require multiple queries
- The AI may occasionally misinterpret ambiguous queries — rephrase if results seem off

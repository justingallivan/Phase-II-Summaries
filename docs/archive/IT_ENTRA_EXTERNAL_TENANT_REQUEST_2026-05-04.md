# IT Request: Entra External ID Tenant for Grant Application Portal

**Sent:** 2026-05-04 (planned)
**To:** DFT
**Cc:** Willie
**From:** Justin Gallivan
**Status:** Drafted, pending send

**Context for repo:** This request unblocks the new applicant intake portal
(`docs/INTAKE_PORTAL_DESIGN.md`). The portal pilot targets the mid-June 2026
Phase II Research submission and depends on this tenant existing. Lead time on
the IT side is the single largest external risk to the pilot date.

---

## Email body

Hi DFT (cc: Willie),

Connor and I are working on a project to build a new grant application portal
for the Foundation. The current portal (GoApply, provided by AkoyaGo) is
kludgy and lacks features and customizations we'd like. As a reminder, GoApply
serves as a one-way bridge from external applicants into the Dynamics CRM —
we want to write a better version of that bridge.

### What we need

A new **Microsoft Entra External ID** tenant created in our Azure
subscription. This will be the separate identity directory for external
applicants (not staff), used for sign-up and authentication on the portal.

I tried to create it myself but lack the permissions to save the new tenant.
The process is short:

1. In the Azure Portal, under "WM Keck Foundation" (confirm tenant ID:
   `baea89d4-d4a9-449a-b1d6-ec31fb5b380c`), go to **Manage Tenants** (gear
   icon).
2. **Create a new tenant** with these settings:
   - Tenant type: **Microsoft Entra External ID** (the CIAM option — *not*
     Entra ID)
   - Organization name: **WM Keck Foundation Grant Application Portal**
   - Initial domain name: **wmkeckapply** (will become
     `wmkeckapply.onmicrosoft.com`)
   - Billing subscription: our default (Azure subscription 1)
   - Resource group: **WMK-AI-DEV**
3. Once the tenant exists, grant **Global Administrator** access in the new
   external tenant to:
   - `jgallivan@wmkeck.org` — primary owner
   - `cnoda@wmkeck.org` — Power Automate and Dynamics administrator;
     will configure user flows and app registrations
   - any IT administrator or IT-owned break-glass account/group you want to
     retain for continuity and oversight

Please also confirm that the new tenant is linked to the billing subscription
during setup. The portal cannot move forward until the tenant is created,
billing is attached, and Connor and I have admin access.

Once complete, please send us:

- The new tenant ID
- Confirmation that billing is linked to the Azure subscription
- Confirmation that Justin, Connor, and any IT-owned admin account/group have
  Global Administrator access in the new external tenant

The domain name `wmkeckapply` is permanent once set — please confirm with me
before proceeding if there's any question.

### Cost

Entra External ID pricing is based on monthly active users; the first 50,000
monthly active users are free. Our expected volume is a few hundred applicants
per cycle, so the cost will be negligible. The tenant still needs to be linked
to our Azure subscription so Microsoft can associate it with billing and feature
access.

---

## Security and data access

Like GoApply, the external tenant we are asking you to create is completely
separate from our organizational Entra ID tenant. Below is a full description
of the security setup.

**What applicants authenticate with.** Applicants sign in using email
one-time passcode (OTP) — they enter their email address, receive a short-lived
code from Microsoft, and enter it to access the portal. There are no passwords
to manage or compromise. Microsoft handles OTP delivery and validation entirely.

**What the external tenant contains.** A dedicated identity directory holding
only applicant authentication records — name, email address, and a
system-generated object ID. No grant data, no financial information, no
internal Foundation records, and no direct access to our Dynamics or SharePoint
environments.

**Isolation from internal systems.** The external tenant is completely
separate from our organizational Entra ID tenant. Applicants authenticated in
the external tenant have no visibility into and no access to our M365
environment, SharePoint, Dynamics, or any internal Foundation systems. The
external tenant has no direct trust relationship or delegated access to those
resources. The portal application is the only bridge: it verifies the applicant,
authorizes each action server-side, and limits access strictly to the
applicant's own institution's application materials.

**How applicant data reaches Dynamics.** Although applicants authenticate
through the external tenant, their credentials are never used to access
Dynamics. When an applicant submits data through the portal, my application
suite verifies that the credentials are valid and then writes the information
to Dynamics using its own dedicated service account credentials — the
credentials we built a few weeks ago and have been using to write to Dynamics.
These are stored securely in our server environment and are completely
separate from anything in the external tenant. The external tenant's role
ends at identity verification. Applicants have no direct pathway to Dynamics.

**How admin access works.** Connor and I both have accounts in our
organizational Entra ID tenant and will appear as guest administrators in the
new external tenant. This is the standard pattern for managing an external
tenant and does not grant us any new access to internal systems — it only
allows us to configure the external tenant's authentication settings.

---

Happy to answer any questions. Let me know if you need anything else from my
end to move forward.

Thanks,
Justin

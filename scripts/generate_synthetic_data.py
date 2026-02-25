import csv
import random
import os

# Set up mock data directory
MOCK_DATA_DIR = "public/mock_data"
os.makedirs(MOCK_DATA_DIR, exist_ok=True)

# Helper to generate fake data
FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Skyler", "Quinn", "Avery", "Blake", "Cameron", "Dakota", "Emerson", "Finley", "Hayden", "Kendall", "Logan", "Parker", "Reese"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]
HAFS = ["Jax", "Akash"]
STATUSES = ["Completed - Live", "Completed - Not Live", "Not Completed", "NA", ""]

def get_fake_name():
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    return first, last

def get_fake_email(first, last):
    return f"{first.lower()}.{last.lower()}@example.edu"

def get_fake_phone():
    return f"({random.randint(100, 999)}) {random.randint(100, 999)}-{random.randint(1000, 9999)}"

# 1. haf_assignments_winter_2026.csv
users = []
for _ in range(50):
    first, last = get_fake_name()
    full_name = f"{first} {last}"
    email = get_fake_email(first, last)
    phone = get_fake_phone()
    haf = random.choice(HAFS)
    users.append({"Full Name": full_name, "Email": email, "Mobile": phone, "Assigned HAF": haf})

with open(f"{MOCK_DATA_DIR}/haf_assignments_winter_2026.csv", "w", newline='') as f:
    writer = csv.DictWriter(f, fieldnames=["Full Name", "Email", "Mobile", "Assigned HAF"])
    writer.writeheader()
    writer.writerows(users)

# Helper for XLS (HTML table format)
def write_xls_html(filename, headers, rows):
    with open(f"{MOCK_DATA_DIR}/{filename}", "w") as f:
        f.write('<head><META http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><table><tr>')
        for h in headers:
            f.write(f'<th filter=all>{h}</th>')
        f.write('</tr>')
        for row in rows:
            f.write('<tr>')
            for cell in row:
                f.write(f'<td style="vnd.ms-excel.numberformat:@">{cell}</td>')
            f.write('</tr>')
        f.write('</table>')

# 2. 2_5 session summary report.xls
headers2 = ["Fellowship Name", "HAF Assignment", "AF: Full Name", "HSF", "AF Preferred Name", "AF Email", "AF Role", "Mentorship: Mentorship Name", "Initial Pairing Date", "Start of Current Relationship", "March Y1 Session Status", "April Y1 Session Status", "May Y1 Session Status", "June Y1 Session Status", "July Y1 Session Status", "August Session Status", "September Session Status", "October Session Status", "November Session Status", "December Session Status", "January Session Status", "Mentorship Notes", "HAF Mentorship Notes"]
rows2 = []
for u in users:
    first = u["Full Name"].split()[0]
    last = u["Full Name"].split()[1]
    rows2.append([
        f'<a href="/a4KUN0000000bz4" target="_top">University of California-Los Angeles 2026</a>',
        "",
        f'<a href="/003UN00000DDLoj" target="_self">{u["Full Name"]}</a>',
        f"Synthetic HSF",
        first,
        u["Email"],
        "Advising Fellow",
        f"M-{random.randint(10000, 99999)}",
        "3/18/2025",
        "3/21/2025",
        random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES),
        random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES),
        random.choice(STATUSES),
        "", ""
    ])
write_xls_html("2_5 session summary report.xls", headers2, rows2)

# 3. afm report compeltion.xls
headers3 = ["Prospective Fellowship", "Full Name", "Preferred Name", "Email", "Mobile", "User ID", "User Email", "Learning Assignment ID", "Learning Activity: Learning Activity ID", "Progress %", "Evaluation Score", "Evaluation Result", "Learning: Learning Name", "Progress"]
rows3 = []
for u in users:
    first = u["Full Name"].split()[0]
    rows3.append([
        "University of California-Los Angeles Fellowship 2026",
        u["Full Name"],
        first,
        u["Email"],
        u["Mobile"],
        f"005UN{random.randint(10000, 99999)}",
        u["Email"],
        f"LA-{random.randint(10000, 99999)}",
        f"LAA-{random.randint(10000, 99999)}",
        str(random.randint(0, 100)),
        str(random.randint(0, 100)),
        random.choice(["Passed", "Failed", "Not Evaluated"]),
        "Synthetic Course Name",
        random.choice(["Completed", "In Progress", "Not Started"])
    ])
write_xls_html("afm report compeltion.xls", headers3, rows3)

# 4. quality tags.xls
headers4 = ["AF Preferred Name", "Last Name", "AF Mobile", "AF Email", "Mentorship Name", "Start of Current Relationship", "Quality Assessment", "3. FAFSA Milestone Status", "4. CSS Profile Milestone Status", "6. College Application Milestone", "# Applied", "September Session Status", "October Session Status", "November Session Status", "December Session Status", "January Session Status", "February Session Status", "Long Mentorship Notes", "Fellowship: Fellowship ID (Record Name)"]
rows4 = []
for u in users:
    first = u["Full Name"].split()[0]
    last = u["Full Name"].split()[1]
    rows4.append([
        first,
        last,
        u["Mobile"],
        u["Email"],
        f"M-{random.randint(10000, 99999)}",
        "3/21/2025",
        random.choice(["Exceeding Expectations", "Meeting Expectations", "Needs Improvement"]),
        random.choice(["Completed", "In Progress", "Not Started"]),
        random.choice(["Completed", "In Progress", "Not Started"]),
        random.choice(["Completed", "In Progress", "Not Started"]),
        str(random.randint(0, 10)),
        random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES), random.choice(STATUSES),
        "", "F-12345"
    ])
write_xls_html("quality tags.xls", headers4, rows4)

# 5. webinar.xls
headers5 = ["Prospective Fellowship", "Full Name", "Progress %", "Full Name", "First Name", "Last Name", "Email", "Learning Assignment ID", "Learning Activity: Learning Activity ID", "Evaluation Score", "Evaluation Result", "Mobile", "User ID", "User Email", "Learning: Learning Name", "Progress"]
rows5 = []
for u in users:
    first = u["Full Name"].split()[0]
    last = u["Full Name"].split()[1]
    rows5.append([
        "University of California-Los Angeles Fellowship 2026",
        u["Full Name"],
        str(random.randint(0, 100)),
        u["Full Name"],
        first,
        last,
        u["Email"],
        f"LA-{random.randint(10000, 99999)}",
        f"LAA-{random.randint(10000, 99999)}",
        str(random.randint(0, 100)),
        random.choice(["Passed", "Failed", "n/a"]),
        u["Mobile"],
        f"005UN{random.randint(10000, 99999)}",
        u["Email"],
        "Webinar Synthetic",
        random.choice(["Completed", "Not Started"])
    ])
write_xls_html("webinar.xls", headers5, rows5)

print("Successfully generated synthetic mock data in public/mock_data/")

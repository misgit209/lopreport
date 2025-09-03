import os
import pyodbc

# === Database Connection Settings ===
driver = "{ODBC Driver 17 for SQL Server}"
server = "172.20.0.254,1433"   # 👈 change to match your SQL Server instance
database = "sel2_master"
username = "cltte"
password = "Cltte@#u2"

# === Output Folder Path ===
output_folder = r"J:\Visitor Photos"
os.makedirs(output_folder, exist_ok=True)

try:
    # Connect to MSSQL
    conn = pyodbc.connect(
        f"DRIVER={driver};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password}"
    )
    cursor = conn.cursor()

    # Fetch VisitorID and Photo column
    cursor.execute("SELECT VisitorID, Photo FROM tblVisitorManagement WHERE Photo IS NOT NULL")

    count = 0
    for row in cursor.fetchall():
        visitor_id = str(row[0])  # Ensure it's a string for folder name
        photo_data = row[1]       # VARBINARY data

        if photo_data:
            # Create a subfolder for each visitor
            visitor_folder = os.path.join(output_folder, visitor_id)
            os.makedirs(visitor_folder, exist_ok=True)

            # Save photo inside the visitor's folder
            file_path = os.path.join(visitor_folder, f"{visitor_id}.jpg")
            with open(file_path, "wb") as f:
                f.write(photo_data)
            count += 1

    print(f"✅ Export complete. {count} photos saved into individual folders in {output_folder}")

except Exception as e:
    print("❌ Error:", e)

finally:
    try:
        cursor.close()
    except Exception:
        pass
    try:
        conn.close()
    except Exception:
        pass

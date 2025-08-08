import pyodbc

def get_connection(
    server="172.20.0.254,1433",
    # server="U2-ESSL-SERVER\SQLEXPRESS",
    database="sel2_master",
    username="cltte",
    password="Cltte@#u2",
    driver="{ODBC Driver 17 for SQL Server}"
):
    try:
        conn_str = (
            f"DRIVER={driver};"
            f"SERVER={server};"
            f"DATABASE={database};"
            f"UID={username};"
            f"PWD={password};"
            f"Encrypt=no;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=30;" 
            f"KeepAlive=1;"
        )
        conn = pyodbc.connect(conn_str, autocommit=False)
        print(f"[INFO] Connected to {database} on {server}")
        return conn
    except pyodbc.Error as e:
        print(f"[ERROR] Connection to {database} on {server} failed: {e}")
        return None
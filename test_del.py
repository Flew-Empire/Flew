import sys
from sqlalchemy.orm import Session
from app.db import get_db, crud
from app.models.admin import AdminCreate

def test_delete():
    db = next(get_db())
    
    print("Creating dummy admin test_delete_admin")
    try:
        new_admin = AdminCreate(username="test_delete_admin", password="testpassword123", is_sudo=False)
        dbadmin = crud.create_admin(db, new_admin)
        print("Created:", dbadmin.username)
    except Exception as e:
        print("Admin already exists or error, fetching it")
        db.rollback()
        dbadmin = crud.get_admin(db, "test_delete_admin")
        
    if not dbadmin:
        print("Could not create or find admin")
        return
        
    print("Now deleting admin test_delete_admin")
    try:
        crud.remove_admin(db, dbadmin)
        print("Deleted successfully!")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_delete()

import CategoryProvider from "./context/CategoryContext"; // ✅ FIXED
import NotificationProvider from "./context/NotificationContext";
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  return (
    <NotificationProvider>
      <CategoryProvider>
        <AppNavigator />
      </CategoryProvider>
    </NotificationProvider>
  );
}

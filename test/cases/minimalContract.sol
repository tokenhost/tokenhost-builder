
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract Minimal_contract {

	string public data;

	constructor(string memory _data) {
		data = _data;
	}

	struct MinimalData {
		address self;
		string data;
	}

	function getAll() external view returns (MinimalData memory) {
		return MinimalData({
			self: address(this),
			data: data
		});
	}

}

contract App {

	address[] public Minimal_list;

	function get_Minimal_N(uint256 index) public view returns (Minimal_contract.MinimalData memory) {
		return Minimal_contract(Minimal_list[index]).getAll();
	}

	function get_first_Minimal_N(uint256 count, uint256 offset) public view returns (Minimal_contract.MinimalData[] memory) {
		require(offset + count <= Minimal_list.length, "Offset + count out of bounds");
		Minimal_contract.MinimalData[] memory results = new Minimal_contract.MinimalData[](count);
		for (uint i = 0; i < count; i++) {
			results[i] = Minimal_contract(Minimal_list[i + offset]).getAll();
		}
		return results;
	}

	function get_last_Minimal_N(uint256 count, uint256 offset) public view returns (Minimal_contract.MinimalData[] memory) {
		require(count + offset <= Minimal_list.length, "Count + offset out of bounds");
		Minimal_contract.MinimalData[] memory results = new Minimal_contract.MinimalData[](count);
		uint len = Minimal_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = Minimal_contract(Minimal_list[idx]).getAll();
		}
		return results;
	}

	function get_Minimal_list_length() public view returns (uint256) { return Minimal_list.length; }
	function get_Minimal_user_length(address user) public view returns (uint256) {
		return user_map[user].Minimal_list.length;
	}

	function get_Minimal_user_N(address user, uint256 index) public view returns (Minimal_contract.MinimalData memory) {
		return Minimal_contract(user_map[user].Minimal_list[index]).getAll();
	}

	function get_last_Minimal_user_N(address user, uint256 count, uint256 offset) public view returns (Minimal_contract.MinimalData[] memory) {
		require(count + offset <= user_map[user].Minimal_list.length, "Count + offset out of bounds");
		Minimal_contract.MinimalData[] memory results = new Minimal_contract.MinimalData[](count);
		uint len = user_map[user].Minimal_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = Minimal_contract(user_map[user].Minimal_list[idx]).getAll();
		}
		return results;
	}

	struct UserInfo {
		address owner;
		bool exists;
		address[] Minimal_list;
		uint256 Minimal_list_length;
	}
	mapping(address => UserInfo) public user_map;
	address[] public UserInfoList;
	uint256 public UserInfoListLength;

	event NewMinimal(address indexed sender, address indexed contractAddress);

	function new_Minimal(string memory data) public returns (address) {
		address mynew = address(new Minimal_contract({
			_data : data
		}));

		if(!user_map[msg.sender].exists) {
			user_map[msg.sender] = create_user_on_new_Minimal(mynew);
		}
		user_map[msg.sender].Minimal_list.push(mynew);
		user_map[msg.sender].Minimal_list_length += 1;

		Minimal_list.push(mynew);
		// The length of Minimal_list is tracked by the array length

		emit NewMinimal(msg.sender, mynew);

		return mynew;
	}

	function create_user_on_new_Minimal(address addr) private returns (UserInfo memory) {
		address[] memory Minimal_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			Minimal_list: Minimal_list_,
			Minimal_list_length: 0
		});
	}

}

